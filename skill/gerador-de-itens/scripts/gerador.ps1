# SPEC-17: prefere o `gerador` instalado globalmente (npm link/npm install -g,
# ver packages/cli/README.md), do mesmo jeito que a skill do Graphify só chama
# `graphify` já instalado no PATH. Cai pro build do repo em modo dev (via
# $env:GERADOR_REPO, ou por padrão a raiz deste próprio repositório, resolvida
# a partir da posição deste script — nunca um caminho de máquina fixo) só
# quando não há instalação global — útil enquanto se desenvolve o próprio
# `gerador` dentro deste repositório.
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
)

$global = Get-Command gerador -ErrorAction SilentlyContinue
if ($global) {
    & $global.Source @Args
    exit $LASTEXITCODE
}

$env:PATH = "C:\Program Files\nodejs;" + $env:PATH

# scripts/gerador.ps1 -> skill/gerador-de-itens/scripts -> raiz do repo é 3 níveis acima.
$repoPadrao = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$repo = if ($env:GERADOR_REPO) { $env:GERADOR_REPO } else { $repoPadrao }
$cli = Join-Path $repo "packages\cli\dist\cli.js"

if (-not (Test-Path $cli)) {
    Write-Host "Sem 'gerador' global e CLI de dev ainda não buildado - rodando 'npm run build --workspace=packages/cli' em $repo..."
    $previousDir = Get-Location
    Set-Location $repo
    npm run build --workspace=packages/cli
    Set-Location $previousDir
}

if (-not (Test-Path $cli)) {
    Write-Error "Ainda não achei $cli depois do build. Instale globalmente (packages/cli/README.md) ou confira `$env:GERADOR_REPO."
    exit 1
}

node $cli @Args
exit $LASTEXITCODE
