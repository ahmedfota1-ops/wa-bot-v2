export const BOT_OWNER = "201119815662";

export const ROAST_LINES = [
  "كسمك",
  "يبن العرص",
  "يبن مرا متناكه 😍",
  "يبن منيوكه 😍",
  "يبن الاحبه 😍",
  "يبن شرموطه",
  "يبن ميتين الكلب ي خول يبن مرا متناكه 😍",
  "اسكت يكسمك كفايه أن امك لفه مصر كلها عشان تشوف حد يركبها ابوك مش مكيفها 😍"
];

export const BAD_WORDS = [
  "كسم", "كس ام", "كسمك", "كسمكم", "كسمه", "كسمها",
  "يلعن امك", "يلعن ابوك", "يلعن اهلك", "يلعن ام", "يلعن اب",
  "امك", "ابوك", "اهلك", "عيلتك", "شرموط", "عرص", "متناك",
  "منيوك", "خول", "احبه", "ابن الكلب", "ابن الوسخه", "يا وسخ", "ميتين"
];

export const state = {
  botEnabled: true,
  privateMode: false,
  allowedUsers: new Set([BOT_OWNER]),
  blockedUsers: new Set(),
  mutedByGroup: new Map(),
  linkGuardGroups: new Set(),
  wordGuardGroups: new Set(),
  roastAutoMode: false,
  roastChats: new Set(),
  roastIndex: 0
};

export function getMutedSet(groupId) {
  if (!state.mutedByGroup.has(groupId)) {
    state.mutedByGroup.set(groupId, new Set());
  }
  return state.mutedByGroup.get(groupId);
}

export function nextRoastLine() {
  const line = ROAST_LINES[state.roastIndex % ROAST_LINES.length];
  state.roastIndex = (state.roastIndex + 1) % ROAST_LINES.length;
  return line;
}
