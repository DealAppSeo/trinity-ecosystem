
$searchPath = "c:\Users\Cash4\OneDrive\Desktop\trinity-ecosystem\trinity-ecosystem\"
$tables = @('trinity_heartbeat', 'agent_heartbeat', 'trinity_agent_registry')
$exclude = @('node_modules', '.git', '.next', 'dist')

Get-ChildItem -Path $searchPath -Recurse -File | Where-Object { 
    $_.FullName -notmatch ($exclude -join '|') -and $_.Extension -match "ts|js|mjs"
} | ForEach-Object {
    $content = Get-Content $_.FullName
    foreach ($table in $tables) {
        if ($content -match "\.from\(['\"]$table['\"]\)") {
            Write-Host "$($_.FullName) contains $table"
        }
    }
}
