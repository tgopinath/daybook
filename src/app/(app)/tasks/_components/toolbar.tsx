"use client";
import { ArrowDownUp, Check, Filter, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { Menu } from "@/components/ui/menu";
import { PRIORITY_META } from "@/components/ui/misc";
import { Popover } from "@/components/tasks/pickers";
import { useApi } from "@/lib/client";
import { cn } from "@/lib/utils";
import { EMPTY_FILTERS, SORT_LABELS, type Filters, type SortKey } from "./shared";
import type { Priority } from "@/components/tasks/types";

type Named = { items: { id: string; name: string }[] };

export function useFilterSources() {
  const cats = useApi<Named>("/api/categories?kind=task");
  const projects = useApi<Named>("/api/projects");
  const tags = useApi<Named>("/api/tags");
  return { cats: cats.data?.items ?? [], projects: projects.data?.items ?? [], tags: tags.data?.items ?? [] };
}

export function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[320px]">
      <Search className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-fg-3" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
        placeholder="Search tasks, notes, #tags"
        aria-label="Search tasks"
        className="h-9 w-full rounded-[10px] border border-line bg-surface pr-8 pl-8 text-sm outline-none placeholder:text-fg-3 focus:border-primary focus:ring-3 focus:ring-primary/15"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Clear search" className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-1 text-fg-3 hover:text-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function FilterButton({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const { cats, projects, tags } = useFilterSources();
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <Popover
      align="end"
      className="w-[260px] p-3"
      trigger={
        <Button variant="outline" size="md" className={cn(active && "border-primary/40 text-primary")} aria-label="Filter tasks">
          <Filter className="h-4 w-4" />
          <span className="hidden sm:inline">Filter</span>
          {active > 0 && <span className="rounded-md bg-primary-soft px-1.5 text-[11px] tabular-nums">{active}</span>}
        </Button>
      }
    >
      {() => (
        <div className="flex flex-col gap-2.5">
          <Row label="Priority">
            <Select value={filters.priority} onChange={(e) => onChange({ ...filters, priority: e.target.value as Priority | "" })}>
              <option value="">Any priority</option>
              {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Category">
            <Select value={filters.categoryId} onChange={(e) => onChange({ ...filters, categoryId: e.target.value })}>
              <option value="">Any category</option>
              <option value="none">No category</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Project">
            <Select value={filters.projectId} onChange={(e) => onChange({ ...filters, projectId: e.target.value })}>
              <option value="">Any project</option>
              <option value="none">No project</option>
              {projects.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Row>
          <Row label="Tag">
            <Select value={filters.tag} onChange={(e) => onChange({ ...filters, tag: e.target.value })}>
              <option value="">Any tag</option>
              {tags.map((c) => (
                <option key={c.id} value={c.id}>
                  #{c.name}
                </option>
              ))}
            </Select>
          </Row>
          {active > 0 && (
            <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)} className="self-start">
              Clear filters
            </Button>
          )}
        </div>
      )}
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-fg-3">{label}</span>
      {children}
    </label>
  );
}

export function SortMenu({ value, onChange }: { value: SortKey; onChange: (s: SortKey) => void }) {
  return (
    <Menu
      trigger={
        <Button variant="outline" aria-label={`Sort: ${SORT_LABELS[value]}`}>
          <ArrowDownUp className="h-4 w-4" />
          <span className="hidden sm:inline">{SORT_LABELS[value]}</span>
        </Button>
      }
      items={[
        { type: "label", label: "Sort by" },
        ...(Object.keys(SORT_LABELS) as SortKey[]).map((k) => ({ label: SORT_LABELS[k], icon: k === value ? Check : undefined, onSelect: () => onChange(k) })),
      ]}
    />
  );
}

/** Removable chips for active filters. */
export function FilterChips({ filters, onChange }: { filters: Filters; onChange: (f: Filters) => void }) {
  const { cats, projects, tags } = useFilterSources();
  const chips: { key: keyof Filters; label: string }[] = [];
  if (filters.priority) chips.push({ key: "priority", label: `${PRIORITY_META[filters.priority].label} priority` });
  if (filters.categoryId) chips.push({ key: "categoryId", label: filters.categoryId === "none" ? "No category" : (cats.find((c) => c.id === filters.categoryId)?.name ?? "Category") });
  if (filters.projectId) chips.push({ key: "projectId", label: filters.projectId === "none" ? "No project" : (projects.find((c) => c.id === filters.projectId)?.name ?? "Project") });
  if (filters.tag) chips.push({ key: "tag", label: `#${tags.find((c) => c.id === filters.tag)?.name ?? "tag"}` });
  if (!chips.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-6 items-center gap-1 rounded-md bg-primary-soft pr-1 pl-2 text-[12px] text-primary">
          {c.label}
          <button type="button" onClick={() => onChange({ ...filters, [c.key]: "" })} aria-label={`Remove filter ${c.label}`} className="rounded p-0.5 hover:bg-primary/10">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
    </div>
  );
}
