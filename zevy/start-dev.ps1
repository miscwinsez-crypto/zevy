# Start Next.js dev server with proper environment
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000"
Write-Host "Starting Next.js dev server..."
Write-Host "Backend should be running at http://127.0.0.1:8000"
Write-Host "UI will be available at http://localhost:3000"
Write-Host ""
npx --yes next@14.2.14 dev -p 3000 -H 127.0.0.1

