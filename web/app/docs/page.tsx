import Navbar from '@/components/Navbar';
import Link from 'next/link';

export default function DocsPage() {
  const apiUrl = process.env.NEXT_PUBLIC_BOT_API_URL || 'https://bot.locket-minh.click';

  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto p-6 fade-in h-full">
        <h2 className="text-3xl font-bold mb-2">Tài liệu tích hợp API</h2>
        <p className="text-white/60 mb-8">
          Hướng dẫn sử dụng REST API để tích hợp quản lý đơn hàng vào website, tool của riêng bạn.
        </p>

        <div className="glass p-6 mb-8">
          <h3 className="text-xl font-bold mb-4 text-teal-400">1. Xác thực (Authentication)</h3>
          <p className="mb-4 text-sm text-white/80">
            Mọi request tới Public API đều cần đính kèm API Key. Bạn có thể truyền qua Header hoặc Query Params.
            Chưa có key? <Link href="/api-keys" className="text-blue-400 hover:underline">Tạo key mới tại đây</Link>.
          </p>
          <div className="code-block mb-2">
            Header: X-API-Key: &lt;YOUR_API_KEY&gt;{'\n'}
            Query:  ?api_key=&lt;YOUR_API_KEY&gt;
          </div>
        </div>

        <div className="glass p-6 mb-8">
          <h3 className="text-xl font-bold mb-4 text-teal-400">2. Endpoints</h3>
          <div className="space-y-6">
            
            {/* GET Orders */}
            <div className="border-l-2 border-green-500 pl-4 py-1">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="badge badge-green">GET</span> <code>/api/v1/orders</code>
              </h4>
              <p className="text-sm text-white/70 mb-2">Lấy danh sách các đơn hàng đang theo dõi.</p>
              <div className="code-block">
{`curl -X GET ${apiUrl}/api/v1/orders \\
  -H "X-API-Key: YOUR_KEY"`}
              </div>
            </div>

            {/* POST Orders */}
            <div className="border-l-2 border-yellow-500 pl-4 py-1">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="badge badge-yellow text-black">POST</span> <code>/api/v1/orders</code>
              </h4>
              <p className="text-sm text-white/70 mb-2">Thêm đơn hàng mới để theo dõi. Cần có số dư tín dụng.</p>
              <div className="code-block">
{`curl -X POST ${apiUrl}/api/v1/orders \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "code": "SPX12345678",
    "name": "Đơn quần áo",
    "partner": "SPX"
  }'`}
              </div>
              <p className="text-xs text-white/50 mt-2">* <code className="text-white/80">partner</code> và <code className="text-white/80">name</code> là tùy chọn.</p>
            </div>

            {/* PUT Orders */}
            <div className="border-l-2 border-blue-500 pl-4 py-1">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="badge badge-blue">PUT</span> <code>/api/v1/orders/:code</code>
              </h4>
              <p className="text-sm text-white/70 mb-2">Đổi tên gợi nhớ của 1 đơn.</p>
              <div className="code-block">
{`curl -X PUT ${apiUrl}/api/v1/orders/SPX12345678 \\
  -H "X-API-Key: YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Đơn giày Nike"}'`}
              </div>
            </div>

            {/* DELETE Orders */}
            <div className="border-l-2 border-red-500 pl-4 py-1">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="badge badge-red">DELETE</span> <code>/api/v1/orders/:code</code>
              </h4>
              <p className="text-sm text-white/70 mb-2">Xóa và ngừng theo dõi đơn hàng.</p>
              <div className="code-block">
{`curl -X DELETE ${apiUrl}/api/v1/orders/SPX12345678 \\
  -H "X-API-Key: YOUR_KEY"`}
              </div>
            </div>

            {/* GET Balance */}
            <div className="border-l-2 border-gray-500 pl-4 py-1">
              <h4 className="font-bold flex items-center gap-2 mb-2">
                <span className="badge badge-gray text-white">GET</span> <code>/api/v1/balance</code>
              </h4>
              <p className="text-sm text-white/70 mb-2">Kiểm tra số dư đơn hàng (credits).</p>
              <div className="code-block">
{`curl -X GET ${apiUrl}/api/v1/balance \\
  -H "X-API-Key: YOUR_KEY"`}
              </div>
            </div>

          </div>
        </div>

      </main>
    </>
  );
}
