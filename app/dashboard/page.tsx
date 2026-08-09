import { FileText, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { StatCard } from '@/components/dashboard/StatCard';
import { DocumentListCard } from '@/components/dashboard/DocumentListCard';
import { getDashboardStats } from '@/lib/dashboard/stats';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const { stats, queue, recentActivity } = await getDashboardStats();

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Documents" value={stats.totalDocuments} icon={FileText} />
        <StatCard
          label="Awaiting Review"
          value={stats.awaitingReview}
          icon={Clock}
          accentClassName="bg-warning/15 text-warning"
        />
        <StatCard
          label="Needs Manual Entry"
          value={stats.needsManualEntry}
          icon={AlertTriangle}
          accentClassName="bg-danger/15 text-danger"
        />
        <StatCard
          label="Approved"
          value={stats.approved}
          icon={CheckCircle2}
          accentClassName="bg-success/15 text-success"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <DocumentListCard
          title="Queue"
          items={queue}
          emptyMessage="Nothing in the pipeline right now."
        />
        <DocumentListCard
          title="Recent Activity"
          items={recentActivity}
          emptyMessage="No documents yet."
        />
      </div>
    </div>
  );
}
