import type { SourceProfile } from "../../electron/chat-plan";

// Minimal original/synthetic excerpts. No API keys, full chats, original PDFs or paid calls.
export const paperProfiles: SourceProfile[] = [
  { id: "file:refinery", title: "renamed-refinery.pdf", opening: "Wang et al. Mapping plant-level stranded assets in China's refining sector. Green hydrogen GH2, CCS and MIX pathways." },
  { id: "file:coal", title: "锁定碳排放约束下我国煤电搁浅资产风险评估_王艳华.pdf", opening: "王艳华等。中国煤电机组。提前退役与灵活性调整。" },
  { id: "file:macro", title: "Mercure - Macroeconomic impact.pdf", opening: "Mercure et al. Global fossil fuel assets, technology diffusion and GDP effects." },
  { id: "file:investor", title: "Semieniuk - Investor losses.pdf", opening: "Semieniuk et al. Oil and gas losses through financial ownership to ultimate owners." },
  { id: "file:power", title: "Fofrich - Ownership of power plants.pdf", opening: "Fofrich Navarro et al. Global fossil power plants, state-owned firms and carbon costs." }
];

export const sourceCases = [
  { question: "再看wang炼油这篇。MIX 为什么比只用绿氢或 CCS 损失更小？", previous: ["王艳华这篇煤电为什么损失更大？"], previousFocus: ["file:coal"], expected: ["file:refinery"], compare: false },
  { question: "Mercure 说中国可能从转型中受益，可中国煤电和炼油两篇都说损失很大。这是不是矛盾？", previous: ["同一家炼厂可以切换技术吗？"], previousFocus: ["file:refinery"], expected: ["file:macro", "file:coal", "file:refinery"], compare: true },
  { question: "它强调发达经济体私人投资者，全球电厂那篇却强调国企。这是相反结论吗？", previous: ["Semieniuk 为什么看最终所有者？"], previousFocus: ["file:investor"], expected: ["file:investor", "file:power"], compare: true },
  { question: "王艳华这篇，差多少，主要发生在什么时候？", previous: ["Explain the refinery."], previousFocus: ["file:refinery"], expected: ["file:coal"], compare: false }
];

export const alternateProfiles: SourceProfile[] = [
  { id: "file:shipping", title: "a.pdf", opening: "Li et al. Shipping transport policy and vessel investment." },
  { id: "file:steel", title: "b.pdf", opening: "Li et al. Steel manufacturing technology and plant costs." },
  { id: "file:urban", title: "c.pdf", opening: "Ortega. Urban transport demand and municipal budgets." }
];
