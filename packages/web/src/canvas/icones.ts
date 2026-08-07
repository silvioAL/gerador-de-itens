import {
  Bell,
  Boxes,
  Clock,
  Cloud,
  Database,
  FileText,
  GitBranch,
  Globe,
  Layers,
  Lock,
  Radio,
  Rabbit,
  Scale,
  Server,
  Shield,
  Smartphone,
  Split,
  Table,
  Users,
  Workflow,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Catálogo fixo de ícones disponíveis pro campo `icon` de um tipo de nó —
 * SVG vetorial de verdade (não emoji), então não depende de fonte de
 * emoji/GPU do SO pra renderizar (achado em uso real: emoji colorido falha
 * silenciosamente em algumas máquinas, ver JOURNEY.md §18.2). Curado, não
 * "qualquer nome do lucide", pra manter o bundle pequeno (cada ícone é
 * importado explicitamente — só estes entram no build).
 *
 * `icon` continua sendo string livre no config: um nome daqui vira um ícone
 * de verdade; qualquer outro texto (ex.: uma letra) continua funcionando como
 * badge de texto — nunca quebra por um nome não reconhecido.
 */
export const MAPA_ICONES: Record<string, LucideIcon> = {
  Server,
  Database,
  Table,
  Radio,
  Rabbit,
  Split,
  Workflow,
  GitBranch,
  Globe,
  Clock,
  Scale,
  Boxes,
  Shield,
  Bell,
  FileText,
  Layers,
  Zap,
  Cloud,
  Lock,
  Users,
  Smartphone,
};
