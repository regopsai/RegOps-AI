import { prisma, createAuditEvent } from "@regops-ai/database";
import type { TransactionImportMode, TransactionDirection, Prisma } from "@regops-ai/database";
import { hasPermission, type Permission, type OrganizationRole } from "@/lib/auth/rbac";
import { parseTransactionCsv } from "./csv-parser";
import { validateTransactionRow } from "./validation";
import type { ValidatedTransactionRow } from "./validation";

export interface ActorContext {
  userId: string;
  organizationId: string;
  role: OrganizationRole;
}

function assertPermission(ctx: ActorContext, permission: Permission): void {
  if (!hasPermission(ctx.role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

export interface ImportTransactionsInput {
  fileBuffer: Buffer;
  fileName: string;
  mode: TransactionImportMode;
}

export interface ImportResult {
  batchId: string;
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  failedRows: number;
  rowErrors: { rowIndex: number; errors: string[] }[];
}

export async function importTransactionsService(
  ctx: ActorContext,
  input: ImportTransactionsInput
): Promise<ImportResult> {
  assertPermission(ctx, "transactions:import");

  const batch = await prisma.transactionImportBatch.create({
    data: {
      organizationId: ctx.organizationId,
      uploadedByUserId: ctx.userId,
      fileName: input.fileName,
      status: "PROCESSING",
      mode: input.mode,
      totalRows: 0,
      validRows: 0,
      importedRows: 0,
      skippedRows: 0,
      failedRows: 0,
    },
  });

  const parseResult = parseTransactionCsv(input.fileBuffer);

  if (parseResult.errors.length > 0) {
    await prisma.transactionImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        errorSummaryJson: JSON.stringify({ fileErrors: parseResult.errors }),
        completedAt: new Date(),
      },
    });

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "TRANSACTION_IMPORT_FAILED",
      entityType: "TransactionImportBatch",
      entityId: batch.id,
      metadataJson: JSON.stringify({
        fileName: input.fileName,
        mode: input.mode,
        fileErrors: parseResult.errors,
      }),
    });

    throw new Error(`CSV validation failed: ${parseResult.errors.join("; ")}`);
  }

  const rowErrors: { rowIndex: number; errors: string[] }[] = [];
  const validatedRows: ValidatedTransactionRow[] = [];

  for (const row of parseResult.rows) {
    const result = validateTransactionRow(row);
    if (result.valid) {
      validatedRows.push(result.data);
    } else {
      rowErrors.push({ rowIndex: row.rowIndex, errors: result.errors });
    }
  }

  // File-level validation: if any row is invalid and mode is FAIL_ON_DUPLICATES, fail entirely
  if (input.mode === "FAIL_ON_DUPLICATES" && rowErrors.length > 0) {
    await prisma.transactionImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        totalRows: parseResult.rows.length,
        validRows: validatedRows.length,
        failedRows: rowErrors.length,
        errorSummaryJson: JSON.stringify({ rowErrors }),
        completedAt: new Date(),
      },
    });

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "TRANSACTION_IMPORT_FAILED",
      entityType: "TransactionImportBatch",
      entityId: batch.id,
      metadataJson: JSON.stringify({
        fileName: input.fileName,
        mode: input.mode,
        totalRows: parseResult.rows.length,
        failedRows: rowErrors.length,
      }),
    });

    throw new Error(`Import failed: ${rowErrors.length} row(s) had validation errors`);
  }

  // Resolve linked entities
  const customerExtRefs = new Set(validatedRows.map((r) => r.customerExternalReference).filter(Boolean));
  const businessExtRefs = new Set(validatedRows.map((r) => r.businessExternalReference).filter(Boolean));
  const caseIds = new Set(validatedRows.map((r) => r.complianceCaseId).filter(Boolean));

  const customers = await prisma.customerProfile.findMany({
    where: {
      organizationId: ctx.organizationId,
      externalReference: { in: Array.from(customerExtRefs) as string[] },
      deletedAt: null,
    },
    select: { id: true, externalReference: true },
  });
  const customerMap = new Map(customers.map((c) => [c.externalReference, c.id]));

  const businesses = await prisma.businessProfile.findMany({
    where: {
      organizationId: ctx.organizationId,
      externalReference: { in: Array.from(businessExtRefs) as string[] },
      deletedAt: null,
    },
    select: { id: true, externalReference: true },
  });
  const businessMap = new Map(businesses.map((b) => [b.externalReference, b.id]));

  const cases = await prisma.complianceCase.findMany({
    where: {
      organizationId: ctx.organizationId,
      id: { in: Array.from(caseIds) as string[] },
      deletedAt: null,
    },
    select: { id: true, customerProfileId: true, businessProfileId: true },
  });
  const caseMap = new Map(cases.map((c) => [c.id, c]));

  // Check existing transactions for deduplication
  const existingTransactions = await prisma.transaction.findMany({
    where: {
      organizationId: ctx.organizationId,
      externalReference: { in: validatedRows.map((r) => r.externalReference) },
    },
    select: { externalReference: true },
  });
  const existingRefs = new Set(existingTransactions.map((t) => t.externalReference));

  const transactionsToCreate: Prisma.TransactionCreateManyInput[] = [];
  const skippedRows: number[] = [];
  const linkErrors: { rowIndex: number; errors: string[] }[] = [];

  for (const row of validatedRows) {
    // Deduplication
    if (existingRefs.has(row.externalReference)) {
      if (input.mode === "FAIL_ON_DUPLICATES") {
        await prisma.transactionImportBatch.update({
          where: { id: batch.id },
          data: {
            status: "FAILED",
            totalRows: parseResult.rows.length,
            validRows: validatedRows.length,
            skippedRows: skippedRows.length,
            failedRows: 1,
            errorSummaryJson: JSON.stringify({
              rowErrors: [{ rowIndex: row.rowIndex, errors: ["Duplicate externalReference"] }],
            }),
            completedAt: new Date(),
          },
        });

        await createAuditEvent({
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId,
          action: "TRANSACTION_IMPORT_FAILED",
          entityType: "TransactionImportBatch",
          entityId: batch.id,
          metadataJson: JSON.stringify({
            fileName: input.fileName,
            mode: input.mode,
            reason: "Duplicate externalReference",
            duplicateRef: row.externalReference,
          }),
        });

        throw new Error(`Import failed: duplicate externalReference "${row.externalReference}"`);
      }
      skippedRows.push(row.rowIndex);
      continue;
    }

    let customerProfileId: string | undefined;
    let businessProfileId: string | undefined;
    let complianceCaseId: string | undefined;

    if (row.customerExternalReference) {
      const id = customerMap.get(row.customerExternalReference);
      if (!id) {
        linkErrors.push({
          rowIndex: row.rowIndex,
          errors: [`Customer with externalReference "${row.customerExternalReference}" not found`],
        });
        continue;
      }
      customerProfileId = id;
    }

    if (row.businessExternalReference) {
      const id = businessMap.get(row.businessExternalReference);
      if (!id) {
        linkErrors.push({
          rowIndex: row.rowIndex,
          errors: [`Business with externalReference "${row.businessExternalReference}" not found`],
        });
        continue;
      }
      businessProfileId = id;
    }

    if (row.complianceCaseId) {
      const caseRecord = caseMap.get(row.complianceCaseId);
      if (!caseRecord) {
        linkErrors.push({
          rowIndex: row.rowIndex,
          errors: [`Case with id "${row.complianceCaseId}" not found in organization`],
        });
        continue;
      }
      complianceCaseId = caseRecord.id;

      // Verify case subject matches linked profile
      if (customerProfileId && caseRecord.customerProfileId && caseRecord.customerProfileId !== customerProfileId) {
        linkErrors.push({
          rowIndex: row.rowIndex,
          errors: ["Linked customer does not match case subject"],
        });
        continue;
      }
      if (businessProfileId && caseRecord.businessProfileId && caseRecord.businessProfileId !== businessProfileId) {
        linkErrors.push({
          rowIndex: row.rowIndex,
          errors: ["Linked business does not match case subject"],
        });
        continue;
      }
    }

    transactionsToCreate.push({
      organizationId: ctx.organizationId,
      customerProfileId,
      businessProfileId,
      complianceCaseId,
      transactionImportBatchId: batch.id,
      externalReference: row.externalReference,
      direction: row.direction as TransactionDirection,
      amount: row.amount,
      currency: row.currency,
      counterpartyName: row.counterpartyName,
      counterpartyAccount: row.counterpartyAccount,
      counterpartyCountry: row.counterpartyCountry,
      paymentRail: row.paymentRail,
      transactionType: row.transactionType,
      description: row.description,
      occurredAt: row.occurredAt,
    });
  }

  // If link errors exist and mode is FAIL_ON_DUPLICATES, fail
  if (input.mode === "FAIL_ON_DUPLICATES" && linkErrors.length > 0) {
    await prisma.transactionImportBatch.update({
      where: { id: batch.id },
      data: {
        status: "FAILED",
        totalRows: parseResult.rows.length,
        validRows: validatedRows.length,
        failedRows: linkErrors.length,
        errorSummaryJson: JSON.stringify({ rowErrors: linkErrors }),
        completedAt: new Date(),
      },
    });

    await createAuditEvent({
      organizationId: ctx.organizationId,
      actorUserId: ctx.userId,
      action: "TRANSACTION_IMPORT_FAILED",
      entityType: "TransactionImportBatch",
      entityId: batch.id,
      metadataJson: JSON.stringify({
        fileName: input.fileName,
        mode: input.mode,
        failedRows: linkErrors.length,
      }),
    });

    throw new Error(`Import failed: ${linkErrors.length} row(s) had link errors`);
  }

  if (transactionsToCreate.length > 0) {
    await prisma.transaction.createMany({
      data: transactionsToCreate,
      skipDuplicates: true,
    });
  }

  const status: TransactionImportMode extends string ? string : never =
    linkErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

  await prisma.transactionImportBatch.update({
    where: { id: batch.id },
    data: {
      status: status as "COMPLETED" | "COMPLETED_WITH_ERRORS",
      totalRows: parseResult.rows.length,
      validRows: validatedRows.length,
      importedRows: transactionsToCreate.length,
      skippedRows: skippedRows.length,
      failedRows: linkErrors.length,
      errorSummaryJson: linkErrors.length > 0 ? JSON.stringify({ rowErrors: linkErrors }) : null,
      completedAt: new Date(),
    },
  });

  await createAuditEvent({
    organizationId: ctx.organizationId,
    actorUserId: ctx.userId,
    action: "TRANSACTIONS_IMPORTED",
    entityType: "TransactionImportBatch",
    entityId: batch.id,
    metadataJson: JSON.stringify({
      fileName: input.fileName,
      mode: input.mode,
      totalRows: parseResult.rows.length,
      importedRows: transactionsToCreate.length,
      skippedRows: skippedRows.length,
      failedRows: linkErrors.length,
    }),
  });

  return {
    batchId: batch.id,
    totalRows: parseResult.rows.length,
    importedRows: transactionsToCreate.length,
    skippedRows: skippedRows.length,
    failedRows: linkErrors.length,
    rowErrors: [...rowErrors, ...linkErrors],
  };
}
