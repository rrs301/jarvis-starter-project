import "server-only";
import { query } from "./db";
import { TEMPLATES } from "./registry";
import { SIZE_PRESETS, clampRect, findFreeSpot, type Rect } from "./layout";
import type { Board, Widget, WidgetDraft, WidgetSize, WidgetType } from "./types";

type BoardRow = { id: string; user_id: string; name: string; order: number };
type WidgetRow = {
  id: string;
  board_id: string;
  user_id: string;
  type: WidgetType;
  title: string;
  size: WidgetSize;
  position: number;
  x: number | null;
  y: number | null;
  w: number | null;
  h: number | null;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  refresh_rule: string | null;
  created_at: Date;
  payload: Record<string, unknown> | null;
  updated_at: Date | null;
};

const toBoard = (r: BoardRow): Board => ({ id: r.id, userId: r.user_id, name: r.name, order: r.order });
const toWidget = (r: WidgetRow): Widget => ({
  id: r.id,
  boardId: r.board_id,
  userId: r.user_id,
  type: r.type,
  title: r.title,
  size: r.size,
  position: r.position,
  x: r.x ?? 0,
  y: r.y ?? 0,
  w: r.w ?? SIZE_PRESETS[r.size].w,
  h: r.h ?? SIZE_PRESETS[r.size].h,
  config: r.config ?? {},
  context: r.context ?? {},
  refreshRule: r.refresh_rule,
  createdAt: new Date(r.created_at).toISOString(),
  data: r.payload,
  dataUpdatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});

const DEFAULT_BOARDS = ["Work", "Content", "Personal"];

/** Starter widgets for a brand-new user's first board. */
const STARTER: Array<{ type: WidgetType; title: string; size: WidgetSize; config?: Record<string, unknown> }> = [
  { type: "today", title: "Today", size: "M" },
  { type: "focus", title: "Focus", size: "S" },
  { type: "notes", title: "Smart Notes", size: "M", config: { layout: "list", placeholder: "Jot something down…", starter: ["Draft the Q1 plan", "Call the studio about lighting"] } },
  { type: "weekly", title: "This week", size: "S" },
  { type: "ideas", title: "Video ideas", size: "M" },
  { type: "inbox", title: "Inbox Brief", size: "S" },
];

export async function getBoards(userId: string): Promise<Board[]> {
  let rows = await query<BoardRow>(`select id, user_id, name, "order" from boards where user_id = $1 order by "order", created_at`, [userId]);
  if (rows.length === 0) {
    // on conflict guards against two first requests seeding at once.
    const created = await query<BoardRow>(
      `insert into boards (user_id, name, "order")
       select $1, name, ord - 1 from unnest($2::text[]) with ordinality as t(name, ord)
       on conflict (user_id, name) do nothing
       returning id, user_id, name, "order"`,
      [userId, DEFAULT_BOARDS],
    );
    const first = created.find((b) => b.order === 0);
    if (first) {
      for (const [i, s] of STARTER.entries()) {
        await insertWidget(userId, first.id, {
          type: s.type,
          title: s.title,
          size: s.size,
          config: s.config ?? TEMPLATES[s.type].defaultConfig,
          context: { source: "starter" },
          label: "",
        }, i);
      }
    }
    rows = await query<BoardRow>(`select id, user_id, name, "order" from boards where user_id = $1 order by "order", created_at`, [userId]);
  }
  return rows.map(toBoard);
}

export async function getBoard(userId: string, boardId: string): Promise<Board | null> {
  const rows = await query<BoardRow>(`select id, user_id, name, "order" from boards where id = $1 and user_id = $2`, [boardId, userId]);
  return rows[0] ? toBoard(rows[0]) : null;
}

export async function getWidgets(userId: string, boardId: string): Promise<Widget[]> {
  const rows = await query<WidgetRow>(
    `select w.*, d.payload, d.updated_at from widgets w
     left join widget_data d on d.widget_id = w.id
     where w.board_id = $1 and w.user_id = $2
     order by w.position, w.created_at`,
    [boardId, userId],
  );
  // Widgets created before the fixed grid have no placement yet: place them
  // once (in their old order) and persist, so the layout never shifts again.
  const unplaced = rows.filter((r) => r.x === null || r.y === null || r.w === null || r.h === null);
  if (unplaced.length) {
    const taken: Rect[] = rows.filter((r) => !unplaced.includes(r)).map((r) => ({ x: r.x!, y: r.y!, w: r.w!, h: r.h! }));
    for (const r of unplaced) {
      const p = SIZE_PRESETS[r.size];
      const spot = findFreeSpot(taken, r.w ?? p.w, r.h ?? p.h);
      taken.push(spot);
      Object.assign(r, spot);
    }
    await saveLayout(userId, boardId, unplaced.map((r) => ({ id: r.id, x: r.x!, y: r.y!, w: r.w!, h: r.h! })));
  }
  return rows.map(toWidget);
}

export async function saveLayout(userId: string, boardId: string, items: Array<Rect & { id: string }>) {
  if (!items.length) return;
  const clean = items.map((i) => ({ id: i.id, ...clampRect(i) }));
  await query(
    `update widgets w set x = t.x, y = t.y, w = t.w, h = t.h
     from jsonb_to_recordset($3::jsonb) as t(id uuid, x int, y int, w int, h int)
     where w.id = t.id and w.board_id = $1 and w.user_id = $2`,
    [boardId, userId, JSON.stringify(clean)],
  );
}

function initialPayload(draft: Pick<WidgetDraft, "type" | "config">): Record<string, unknown> | null {
  const starter = Array.isArray(draft.config.starter) ? draft.config.starter : [];
  const now = Date.now();
  if (draft.type === "notes") {
    return { notes: starter.map((t, i) => ({ id: `n${now}${i}`, text: String(t), createdAt: new Date().toISOString() })) };
  }
  if (draft.type === "today") {
    return {
      tasks: starter.map((t: { time?: string; title?: string }, i) => ({
        id: `t${now}${i}`,
        time: String(t?.time ?? ""),
        title: String(t?.title ?? ""),
        done: false,
      })),
    };
  }
  return null;
}

async function insertWidget(userId: string, boardId: string, draft: WidgetDraft, position: number): Promise<string> {
  const taken = await query<Rect>(
    `select x, y, w, h from widgets where board_id = $1 and x is not null and y is not null and w is not null and h is not null`,
    [boardId],
  );
  const preset = draft.w && draft.h ? { w: draft.w, h: draft.h } : SIZE_PRESETS[draft.size];
  const { w, h } = clampRect({ x: 0, y: 0, ...preset });
  const spot = findFreeSpot(taken, w, h);
  const [row] = await query<{ id: string }>(
    `insert into widgets (board_id, user_id, type, title, size, position, config, context, refresh_rule, x, y, w, h)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) returning id`,
    [boardId, userId, draft.type, draft.title, draft.size, position, draft.config, draft.context, null, spot.x, spot.y, spot.w, spot.h],
  );
  const payload = initialPayload(draft);
  if (payload) await query(`insert into widget_data (widget_id, payload) values ($1, $2)`, [row.id, payload]);
  return row.id;
}

export async function addWidget(userId: string, boardId: string, draft: WidgetDraft): Promise<string> {
  const board = await getBoard(userId, boardId);
  if (!board) throw new Error("Board not found");
  const [{ next }] = await query<{ next: number }>(
    `select coalesce(max(position) + 1, 0)::int as next from widgets where board_id = $1`,
    [boardId],
  );
  return insertWidget(userId, boardId, draft, next);
}

export async function updateWidget(
  userId: string,
  widgetId: string,
  patch: { size?: WidgetSize; title?: string; config?: Record<string, unknown> },
) {
  await query(
    `update widgets set
       size = coalesce($3, size),
       title = coalesce($4, title),
       config = coalesce($5, config)
     where id = $1 and user_id = $2`,
    [widgetId, userId, patch.size ?? null, patch.title ?? null, patch.config ?? null],
  );
}

export async function deleteWidget(userId: string, widgetId: string) {
  await query(`delete from widgets where id = $1 and user_id = $2`, [widgetId, userId]);
}

export async function setWidgetData(userId: string, widgetId: string, payload: Record<string, unknown>) {
  const owned = await query(`select 1 from widgets where id = $1 and user_id = $2`, [widgetId, userId]);
  if (owned.length === 0) throw new Error("Widget not found");
  await query(
    `insert into widget_data (widget_id, payload, updated_at) values ($1, $2, now())
     on conflict (widget_id) do update set payload = excluded.payload, updated_at = now()`,
    [widgetId, payload],
  );
}

export async function getWidget(userId: string, widgetId: string): Promise<Widget | null> {
  const rows = await query<WidgetRow>(
    `select w.*, d.payload, d.updated_at from widgets w left join widget_data d on d.widget_id = w.id
     where w.id = $1 and w.user_id = $2`,
    [widgetId, userId],
  );
  return rows[0] ? toWidget(rows[0]) : null;
}

export async function getAiProviderSetting(userId: string): Promise<string | null> {
  const rows = await query<{ ai_provider: string | null }>(`select ai_provider from user_settings where user_id = $1`, [userId]);
  return rows[0]?.ai_provider ?? null;
}

export async function setAiProviderSetting(userId: string, provider: string | null) {
  await query(
    `insert into user_settings (user_id, ai_provider, updated_at) values ($1, $2, now())
     on conflict (user_id) do update set ai_provider = excluded.ai_provider, updated_at = now()`,
    [userId, provider],
  );
}
