import { copyFile, mkdir } from "node:fs/promises";
import { constants, existsSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
// dist/cli.js é um único arquivo bundlado (tsup) ao lado de templates/ — mas
// em teste/dev este módulo roda direto do fonte (src/commands/), um nível
// mais fundo, então "../templates" aponta pro lugar errado nesse caso. Tenta
// os dois, na ordem do caminho de produção primeiro.
const CANDIDATOS_TEMPLATE_SKILL = [
  resolve(AQUI, "../templates/skill/SKILL.md"),
  resolve(AQUI, "../../templates/skill/SKILL.md"),
];
const TEMPLATE_SKILL = CANDIDATOS_TEMPLATE_SKILL.find(existsSync) ?? CANDIDATOS_TEMPLATE_SKILL[0];

async function existe(caminho: string): Promise<boolean> {
  return access(caminho, constants.F_OK).then(
    () => true,
    () => false
  );
}

/**
 * Instala a skill do Claude Code no projeto atual — pra quem só tem o pacote
 * npm (sem acesso ao repositório do `gerador`, que é privado — SPEC-17), essa
 * é a única forma de pegar o SKILL.md, já que ele não vive em lugar nenhum
 * fora deste pacote. Sempre sobrescreve: é conteúdo mantido pela ferramenta,
 * não algo que o usuário edita (diferente de `config/`, que `init` nunca
 * sobrescreve).
 */
export async function skillInstall(args: string[]): Promise<void> {
  const alvo = resolve(args[0] ?? ".claude/skills/gerador-de-itens");
  await mkdir(alvo, { recursive: true });

  const destino = join(alvo, "SKILL.md");
  const jaExistia = await existe(destino);
  await copyFile(TEMPLATE_SKILL, destino);

  console.log(`${jaExistia ? "Atualizado" : "Criado"}: ${destino}`);
  console.log('Skill pronta — abra uma sessão do Claude Code neste projeto e peça algo como "quebrar essa mudança em backlog".');
}
