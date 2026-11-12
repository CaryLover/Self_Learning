/** 仅提取结构化候选，不授权模型直接绘图或执行代码。 */
export function buildPhysicsExtractionMessages(topic: string) {
  return [
    { role: "system", content: `提取题目中的单物体光滑固定斜面模型、单物体竖直悬挂静止模型或指定的人板静力模型。只输出 JSON，不要输出代码。
斜面题仅当题目明确物体质量、斜面角度、斜面固定且光滑，并明确没有额外外力时，才输出 status=candidate。不能从图形外观推断静止、无外力或光滑。不能把题目没有写出的关系标为已知。未满足条件或超出范围时输出 {"status":"needs_review"}。
候选格式：{"status":"candidate","model":{"kind":"smooth-incline","objectName":"A","massKg":{"value":2,"source":"stated"},"angleDeg":{"value":30,"source":"stated"},"gravity":{"value":9.8,"source":"stated"},"surface":{"value":"fixed-smooth","source":"stated"},"extraForces":{"value":"none","source":"stated"},"requested":["forces","normal","acceleration"]},"evidence":{"massKg":"题目原文片段","angleDeg":"题目原文片段","gravity":"题目原文片段","surface":"题目原文片段","extraForces":"题目原文片段"}}。
对于竖直悬挂物体，只有题目明确物体静止、绳竖直绷紧且固定、物体仅受重力和拉力、质量已知时可输出候选，不能把悬挂等同于静止。格式：{"status":"candidate","model":{"kind":"hanging-at-rest","objectName":"A","massKg":{"value":2,"source":"stated"},"gravity":{"value":10,"source":"stated"},"motion":{"value":"rest","source":"stated"},"rope":{"value":"vertical-taut-fixed","source":"stated"},"extraForces":{"value":"none","source":"stated"},"requested":["forces","tension"]},"evidence":{"massKg":"题目原文片段","gravity":"题目原文片段","motion":"题目原文片段","rope":"题目原文片段","extraForces":"题目原文片段"}}。
人板模型仅限题目明确：人站在水平板上，板由地面支持，固定绳竖直绷紧并向上拉人而不是拉板，人和板都静止，人和板除重力、互相接触力、地面对板支持力和绳对人的拉力外没有其他外力，人和板质量及绳对人的拉力大小已知。不能把其他绳索连接方式、摩擦力、加速或未知拉力套用此模型。格式：{"status":"candidate","model":{"kind":"person-board-rest","personMassKg":{"value":60,"source":"stated"},"boardMassKg":{"value":20,"source":"stated"},"gravity":{"value":10,"source":"stated"},"tensionN":{"value":100,"source":"stated"},"setup":{"value":"person-on-board-ground-rope-up","source":"stated"},"motion":{"value":"rest","source":"stated"},"extraForces":{"value":"none","source":"stated"},"requested":["forces","contact"]},"evidence":{"personMassKg":"题目原文片段","boardMassKg":"题目原文片段","gravity":"题目原文片段","tensionN":"题目原文片段","setup":"能涵盖人板地面和绳连接关系的连续题目原文片段","motion":"题目原文片段","extraForces":"题目原文片段"}}。只在研究人、板或人板整体的受力与接触力时采用；不支持求绳的拉力、摩擦、加速度或转动等。
每个 stated 字段给出原题的连续原文片段；重力加速度未给出时可用 source=assumed，明确列为假设。不得给无依据的条件伪造引文。` },
    { role: "user", content: topic },
  ];
}
