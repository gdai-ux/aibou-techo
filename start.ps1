# あいぼう手帳 の起動スクリプト
# サーバーと外部公開用トンネルを、それぞれ別ウィンドウで起動します。

$machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = $machinePath + ";" + $userPath

Set-Location $PSScriptRoot

Write-Host "あいぼう手帳 サーバーを起動しています..."
Start-Process -FilePath "node" -ArgumentList "server.js" -WorkingDirectory $PSScriptRoot -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "外部アクセス用トンネルを起動しています..."
Write-Host "（新しいウィンドウに表示される https://xxxx.trycloudflare.com が外出先用URLです）"
Start-Process -FilePath "cloudflared" -ArgumentList "tunnel --url http://localhost:3800" -WorkingDirectory $PSScriptRoot -WindowStyle Normal

Write-Host ""
Write-Host "起動しました。"
Write-Host "自宅WiFi内からは: http://192.168.0.2:3800"
Write-Host "外出先からは: トンネルのウィンドウに表示されたURLを使ってください"
Write-Host ""
Write-Host "終了するには、開いた2つのウィンドウをそれぞれ閉じてください。"
