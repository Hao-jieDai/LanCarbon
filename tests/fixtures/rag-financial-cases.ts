// Synthetic alternatives in different sectors; neither case is a real user's paper.
export const financialAlternatives = [
  { title: "Ferry transitions", original: "Three mutually exclusive retrofit scenarios for the same ferry fleet have discounted losses: route A CNY 95 billion; route B CNY 85 billion; route C CNY 70 billion. These are alternative worlds, not disjoint asset groups.", question: "Compared with routes A and B, how much does route C save?", pairwise: [25, 15], invalidCombinedSaving: 40 },
  { title: "Crop adaptations", original: "对同一批农业设施，三个互斥适应情景的现值损失分别为：方案甲63.4亿元，方案乙55.1亿元，方案丙42.3亿元。三者是不同反事实情景，不是同一总额的分项。", question: "方案丙分别比甲和乙少损失多少钱？", pairwise: [21.1, 12.8], invalidCombinedSaving: 33.9 }
];
