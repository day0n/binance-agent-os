export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(
    {
      status: "ok",
      service: "binance-agent-os",
      version: "0.1.0",
      readOnly: true,
      dependenciesVerified: false,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
