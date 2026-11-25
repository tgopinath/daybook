import { MemoryDetail } from "@/components/memories/memory-detail";

export const metadata = { title: "Memory" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemoryDetail id={id} />;
}
