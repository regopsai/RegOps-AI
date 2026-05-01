import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/server";
import { importTransactionsService } from "@/lib/transactions/import-service";
import type { TransactionImportMode } from "@regops-ai/database";

export async function POST(request: NextRequest) {
  const context = await requirePermission("transactions:import");

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const mode = (formData.get("mode") as TransactionImportMode | null) ?? "SKIP_DUPLICATES";

    if (!file) {
      return NextResponse.json({ error: "File is required" }, { status: 400 });
    }

    if (!file.name.endsWith(".csv")) {
      return NextResponse.json({ error: "Only CSV files are accepted" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const result = await importTransactionsService(
      {
        userId: context.user.id,
        organizationId: context.organization.id,
        role: context.membership.role,
      },
      {
        fileBuffer: buffer,
        fileName: file.name,
        mode,
      }
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
