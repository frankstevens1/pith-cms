import { pith } from '../../../../src/lib/pith';

const handlers = pith.editor?.handlers;

function unavailable(): Response {
  return Response.json(
    { ok: false, error: { code: 'EDITOR_NOT_CONFIGURED', message: 'Editor is not configured.' } },
    { status: 503 },
  );
}

export async function GET(
  request: Request,
  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },
) {
  return handlers ? handlers.GET(request, context) : unavailable();
}

export async function POST(
  request: Request,
  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },
) {
  return handlers ? handlers.POST(request, context) : unavailable();
}

export async function PUT(
  request: Request,
  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },
) {
  return handlers ? handlers.PUT(request, context) : unavailable();
}

export async function DELETE(
  request: Request,
  context: { params: Promise<Record<string, string | readonly string[] | undefined>> },
) {
  return handlers ? handlers.DELETE(request, context) : unavailable();
}
