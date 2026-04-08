import Navbar from '@/components/Navbar';
import ApiKeysClient from './ApiKeysClient';

export default function ApiKeysPage() {
  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto p-6 fade-in h-full">
        <ApiKeysClient />
      </main>
    </>
  );
}
