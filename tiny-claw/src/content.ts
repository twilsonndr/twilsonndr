// All the words. The sim and UI read from here; nothing in this file knows about three.js.

export interface Speaker {
  name: string;
  icon: string;
  color: string;
}

export const SPEAKERS = {
  narrator: { name: 'Narrator', icon: '📣', color: '#f4e9c8' },
  sidney: { name: 'Sidney', icon: '🦀', color: '#ff7a4d' },
  bernard: { name: 'Bernard Beakman, Channel 6 Pelican News', icon: '📺', color: '#9ad0ff' },
  gerald: { name: 'Gerald the Clam', icon: '🦪', color: '#d6c7b0' },
  starla: { name: 'Starla the Starfish', icon: '⭐', color: '#ffb36b' },
  linda: { name: 'Linda (lives in a yogurt cup)', icon: '🥛', color: '#f2f2f2' },
  puff: { name: 'Dr. Pufferton', icon: '🐡', color: '#ffd84d' },
  tim: { name: 'Tim the Baby Turtle', icon: '🐢', color: '#8fe08a' },
  clawrence: { name: 'Clawrence, Big Claw Brigade', icon: '💪', color: '#b48cff' },
  admiral: { name: 'Admiral Clawdius Maximus', icon: '🎖️', color: '#ff4d6d' },
  everyone: { name: 'Everyone', icon: '🗣️', color: '#ffffff' },
} satisfies Record<string, Speaker>;

export type SpeakerId = keyof typeof SPEAKERS;
export type Line = [SpeakerId, string];

export const TITLE = 'Tiny Claw';
export const TAGLINE = "It's not the size of the claw. It's the side to side.";

export const INTRO: Line[] = [
  ['narrator', 'This is Sidney. Sidney is a fiddler crab.'],
  ['narrator', 'Fiddler crabs are famous for having one ENORMOUS claw.'],
  ['narrator', "Sidney's is... right there. No, lower. Keep going. There."],
  ['sidney', "It's a normal size. It's fun-sized."],
  ['bernard', 'BREAKING: Admiral Clawdius Maximus, owner of the largest claw on Earth, plans to pinch the Moon right out of the sky.'],
  ['bernard', "No Moon means no tides. No tides means the ocean just... sits there. Experts are calling it \"no motion in the ocean.\""],
  ['sidney', "I'll stop him!"],
  ['everyone', 'YOU??'],
  ['gerald', "Kid, you couldn't pinch a Pringle."],
  ['sidney', "Watch me. Or don't. I'll be over here. Sideways."],
];

export interface Chapter {
  id: string;
  title: string;
  subtitle: string;
  intro: Line[];
  outro: Line[];
  tips: string[];
}

export const CHAPTERS: Chapter[] = [
  {
    id: 'tidepool',
    title: 'Chapter 1: Nobody Believes in Sidney',
    subtitle: 'Tidepool Town',
    intro: [
      ['tim', 'Help! Somebody left six-pack rings all over the beach and we are VERY stuck!'],
      ['starla', 'Somebody with a big claw should help them.'],
      ['sidney', "Big claws can't do fiddly little snips. Tiny claws can."],
      ['gerald', "That's the saddest thing I've ever heard and I live in sand."],
    ],
    outro: [
      ['tim', 'You freed us! With a claw the size of a grain of rice!'],
      ['starla', "Okay, that was kind of amazing. I'm a believer. I don't have a brain, but I believe."],
      ['gerald', "Lucky snips. Doesn't mean anything."],
      ['bernard', "DEVELOPING: the Admiral's Big Claw Brigade has landed on the beach. They look moist and angry."],
    ],
    tips: [
      'Crabs walk SIDEWAYS fast (A / D). Forward and back (W / S) is... a struggle.',
      'Walk up to the rings and pinch (SPACE or click). Tiny claws are great at tiny jobs.',
      'Seagull shadow? Dash sideways (SHIFT). You are briefly untouchable.',
      'Scuttle left-right-left-right fast to charge a MEGA SNIP.',
    ],
  },
  {
    id: 'brigade',
    title: 'Chapter 2: The Big Claw Brigade',
    subtitle: 'Low Tide Beach',
    intro: [
      ['clawrence', 'Hand over the beach, shrimp.'],
      ['sidney', "I'm a crab."],
      ['clawrence', 'With THAT claw? Prove it.'],
      ['narrator', 'Big claws are heavy. They swing slow and only hit what is in FRONT of them.'],
      ['narrator', "Get to their side and pinch. Side to side, Sidney. Side to side."],
    ],
    outro: [
      ['clawrence', "He pinched my pinky toe! I didn't know I HAD a pinky toe!"],
      ['puff', "I puffed up in shock and now I can't un-puff. I believe in you, kid!"],
      ['linda', "I'm putting you on my yogurt cup. That's the highest honor we have."],
      ['gerald', "...Still doesn't mean anything."],
      ['narrator', 'The sky goes dark. The ocean goes weirdly still. Something enormous is climbing out of the sea.'],
    ],
    tips: [
      'Big claws block pinches from the front. Hit them from the SIDE, or while their claw is stuck.',
      'A tide wall is coming! Scuttle sideways into the gap.',
      'Kelp heals you. Eat your greens.',
    ],
  },
  {
    id: 'admiral',
    title: 'Chapter 3: The Moon Pincher',
    subtitle: 'The Last Beach on Earth',
    intro: [
      ['admiral', 'Behold! The biggest claw money can buy!'],
      ['admiral', "Once I pinch the Moon, the tides stop, and all the beachfront property is MINE. Forever. At permanent low tide."],
      ['sidney', 'Why do you even want that?'],
      ['admiral', 'Because I CAN. Look at this claw. LOOK AT IT.'],
      ['sidney', "It's very big. Who tightened all those tiny screws, though?"],
      ['admiral', '...A guy.'],
      ['narrator', 'When his claw gets stuck in the sand, a tiny screw pops loose. Only a tiny claw can reach it.'],
    ],
    outro: [
      ['narrator', 'The last tiny screw pings off into the sunset. The Moon Pincher falls apart like cheap patio furniture.'],
      ['narrator', 'The Moon drifts home. The tide rolls in. The ocean starts moving again.'],
      ['bernard', 'The Moon is back. The tides are back. The ocean is, and I quote, "back in motion."'],
      ['admiral', "It's not fair! My claw was SO BIG!"],
      ['sidney', "It's not the size of the claw."],
      ['everyone', "IT'S THE SIDE TO SIDE!"],
      ['gerald', "...Fine. I believe in you. Don't make it weird."],
    ],
    tips: [
      'Stand under the claw to bait a slam, then scuttle out of the red circle.',
      'Claw stuck in the sand? Find the glowing screw and PINCH it.',
      'Tide walls have gaps. Side to side!',
    ],
  },
];

export interface Doubter {
  id: SpeakerId;
  kind: 'clam' | 'starfish' | 'hermit' | 'puffer';
  x: number;
  z: number;
  // first chapter index at which they start believing (3 = only after the win)
  believesFrom: number;
  doubt: string[];
  believe: string[];
}

export const DOUBTERS: Doubter[] = [
  {
    id: 'gerald',
    kind: 'clam',
    x: -13.2,
    z: 0.8,
    believesFrom: 3,
    doubt: [
      'Is that a claw or a typo?',
      'My grandma has a bigger claw and she is a scallop.',
      'Save the world? You can barely save a sandwich.',
      "I've seen bigger claws on a fork.",
      'Walking sideways is not a personality.',
      "I'm not mad. I'm just a clam. We're always like this.",
    ],
    believe: ['...Fine. Go Sidney. Or whatever.'],
  },
  {
    id: 'starla',
    kind: 'starfish',
    x: 13.2,
    z: 1.2,
    believesFrom: 1,
    doubt: [
      'Aww, look at him go. Wrong way, buddy.',
      'Real heroes have claws you can see from space.',
      'Is he... dancing? Is that the plan?',
    ],
    believe: [
      'SIDNEY! SIDNEY! SIDNEY!',
      "It's not the size of the claw!",
      'I have five arms and all of them believe in you!',
    ],
  },
  {
    id: 'linda',
    kind: 'hermit',
    x: -13.4,
    z: -4.6,
    believesFrom: 1,
    doubt: [
      'Do you need a snack, sweetie? You look tiny.',
      "I live in a yogurt cup and even I think you're in over your head.",
      'Somebody tell him he is walking sideways again.',
    ],
    believe: ['Side to side! Side to side!', 'Tiny claw, HUGE heart!', "Snip snip, baby! That's my boy! Not literally."],
  },
  {
    id: 'puff',
    kind: 'puffer',
    x: 13.4,
    z: -4.4,
    believesFrom: 2,
    doubt: [
      'Clinically speaking, that claw is adorable. That is not a compliment.',
      'I puff up when scared. I am currently deflated. That is how scared I am of you.',
      'Statistically, heroes are larger.',
    ],
    believe: ["I was wrong and I'm big enough to admit it. Unlike your claw.", 'The data is in. You rule.', '*puffs with pride*'],
  },
];

export const CRITTERS = ['turtle', 'fish', 'turtle', 'seal', 'fish', 'turtle'] as const;
export type Critter = (typeof CRITTERS)[number];

export const FREED_LINES = [
  "I'm free! I'm FREE! Wait, which way is the ocean?",
  'Thank you, tiny sir!',
  "I'm following you now. This is my life now.",
  'Nobody with a big claw even TRIED.',
  'Snip snip hooray!',
  "I'm joining the conga line!",
];

export const GULL_LINES = ['MINE!', 'Mine?', 'MIIIINE!', 'Is that a chip? MINE!', 'MINE (respectfully)!'];

export const MINION_NAMES = ['Clawrence', 'Chad Chela', 'Big Kevin', 'Pinchard', 'Sir Clamps-a-Lot', 'Grabriel', 'Brock Lobster', 'Clawdette'];

export const MINION_TAUNTS = [
  'Big claw coming through!',
  'Nice claw. Did it come with a magnifying glass?',
  'I bench press boats.',
  'Never skip claw day.',
  'Pinch THIS. Wait, no. Not that.',
  'Hold still, shrimp!',
];

export const MINION_HURT = [
  'MY PINKY TOE!',
  'Right in the tiny spot!',
  'He found the gap in my armor! It is tiny! Like him!',
  'OW. Precision!',
  'I did not train for sideways!',
];

export const BLOCKED_LINES = ['BONK', 'Blocked by a claw the size of a sofa.', 'Not from the front! Try the SIDE.'];

export const BOSS_LINES = {
  slam: ['BEHOLD: CLAW!', 'Feel the SIZE!', 'Compensating? Me? NEVER!', 'Claw day, every day!'],
  waves: ['SURF\'S UP, SHRIMP!', 'Stop moving side to side, it is ANNOYING!', 'Ride THIS tide!'],
  bubbles: ['Bubble trouble!', 'Pop quiz! Heh. Pop.', 'Fizzy death from above!'],
  screw: [
    'Hey! That one was load-bearing!',
    'Who taught him TORQUE?!',
    "I didn't think anyone could REACH those!",
    'My WARRANTY!',
    'NOT THE LAST SCREW!',
  ],
  adds: ['BRIGADE! ASSEMBLE!', 'Somebody with a big claw, HELP!'],
};

export const GAME_OVER_LINES = [
  'Everyone was right about you.',
  'Gerald is going to be insufferable now.',
  'The ocean remains motionless. Like your chances.',
  'Big claws: 1. Tiny claw: 0. For now.',
];

export const RANKS: [number, string][] = [
  [0, 'Plankton With a Dream'],
  [4000, 'Certified Snipper'],
  [7000, 'Tiny But Mighty'],
  [10000, 'Side-to-Side Sensei'],
  [13000, 'Legend of the Low Tide'],
];

export function rankFor(score: number): string {
  let r = RANKS[0][1];
  for (const [min, name] of RANKS) if (score >= min) r = name;
  return r;
}
