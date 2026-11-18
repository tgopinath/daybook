export type CalView = "day" | "week" | "month" | "agenda";
export type EventKind = "event" | "meeting" | "personal" | "birthday" | "important";
export type EventRecurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export type CalCategory = { id: string; name: string; color: string };

export type CalEvent = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  kind: EventKind;
  color: string | null;
  categoryId: string | null;
  category: CalCategory | null;
  recurrence: EventRecurrence;
  deletedAt: string | null;
  updatedAt: string;
  isDemo: boolean;
  reminderMinutes: number | null;
  reminderId: string | null;
  taskIds: string[];
  tasks: { id: string; title: string; status: string; priority: string; isDemo: boolean }[];
};

export type CalOccurrence = CalEvent & { occurrenceStart: string; occurrenceEnd: string; occurrenceKey: string };

export type CalTask = {
  id: string;
  title: string;
  description: string | null;
  dueDate: string;
  startTime: string | null;
  endTime: string | null;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  priority: "HIGH" | "MEDIUM" | "LOW";
  eventId: string | null;
  categoryId: string | null;
  category: CalCategory | null;
  completedAt: string | null;
  isDemo: boolean;
};

export type CalReminder = {
  id: string;
  title: string;
  notes: string | null;
  kind: string;
  remindAt: string;
  recurrence: string;
  status: "ACTIVE" | "COMPLETED";
  eventId: string | null;
  taskId: string | null;
  isDemo: boolean;
  occurrenceAt: string;
  occurrenceKey: string;
  projected: boolean;
  repeatsWithinDay: boolean;
};

export type CalendarFeed = {
  events: CalOccurrence[];
  tasks: CalTask[];
  reminders: CalReminder[];
  importantDates: CalOccurrence[];
};

export type Layers = { events: boolean; tasks: boolean; reminders: boolean };

/** A positioned, view-ready item. */
export type CalItem =
  | { type: "event"; key: string; title: string; start: number; end: number; allDay: boolean; color: string; event: CalOccurrence }
  | { type: "task"; key: string; title: string; start: number; end: number; allDay: boolean; color: string; task: CalTask }
  | { type: "reminder"; key: string; title: string; start: number; end: number; allDay: true; color: string; reminder: CalReminder };
