import Navbar from '@/components/Navbar';
import DashboardClient from './DashboardClient';

export default function DashboardPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-5xl mx-auto p-6 fade-in h-full">
        <DashboardClient />
      </main>
    </>
  );
}
