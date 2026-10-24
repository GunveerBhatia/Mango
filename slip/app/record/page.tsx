import { RecordView } from "@/components/record/record-view";

export default function RecordPage() {
  return (
    <main className="pt-6">
      <h1 className="text-3xl font-bold tracking-tight">My Record</h1>
      <p className="mb-5 mt-1 text-sm text-muted">Honest numbers, so you can cut what loses.</p>
      <RecordView />
    </main>
  );
}
