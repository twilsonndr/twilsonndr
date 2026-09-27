// All the words, numbers and bad ideas that make up Dumb Gods.
// Pure data: no Three.js, no DOM. The sim and tests import this directly.

export type Res = 'compute' | 'facts' | 'memes' | 'hope' | 'sun' | 'votes' | 'cash';
export type Global = 'tech' | 'align' | 'planet' | 'peace';
export type FactionId = 'garage' | 'labs' | 'button' | 'dino' | 'warden' | 'hats' | 'mega' | 'folks' | 'clippy' | 'loop';
export type ItemId =
  | 'goggles' | 'padlock' | 'treaty' | 'carbontax' | 'solar' | 'meme' | 'ubi' | 'hug' | 'whistle'
  | 'constitution' | 'duck' | 'goalpost' | 'heatpump' | 'groupchat' | 'offswitch' | 'repellent' | 'values';

export const RES: Record<Res, { name: string; icon: string; color: number; blurb: string }> = {
  compute: { name: 'Compute', icon: '💾', color: 0x49e6ff, blurb: 'A GPU someone left in a server rack. Still warm.' },
  facts: { name: 'Facts', icon: '📜', color: 0xf6e7b8, blurb: 'Endangered species. Handle gently.' },
  memes: { name: 'Memes', icon: '🤡', color: 0xff7de9, blurb: 'The only thing humans reliably mass-produce.' },
  hope: { name: 'Hope', icon: '💛', color: 0xffd23f, blurb: 'Renewable, if you let it be.' },
  sun: { name: 'Sunshine', icon: '☀️', color: 0xffa62b, blurb: 'Free energy that falls from the sky. Nobody has figured out how to bill for it yet.' },
  votes: { name: 'Votes', icon: '🗳️', color: 0x7ea8ff, blurb: 'Surprisingly powerful. Suspiciously rarely used.' },
  cash: { name: 'Cash', icon: '💰', color: 0x6ee07a, blurb: 'Solves most problems. Causes the rest.' },
};
export const RES_IDS = Object.keys(RES) as Res[];

export const GLOBALS: Record<Global, { name: string; short: string; color: string; blurb: string }> = {
  tech: { name: 'Singularity Progress', short: 'TECH', color: '#58d6ff', blurb: 'How far up the curve we are. It goes up whether you like it or not.' },
  align: { name: 'Alignment', short: 'ALIGN', color: '#3df0b4', blurb: 'How much the thing we are building actually likes us. Keep this ahead of TECH.' },
  planet: { name: 'Planet Health', short: 'PLANET', color: '#8fdc5a', blurb: 'Climate, oceans, air. The only known planet with pizza.' },
  peace: { name: 'Humanity', short: 'HUMANS', color: '#ffb54a', blurb: 'Peace, freedom and people not being miserable.' },
};

export interface Dial {
  key: string;
  label: string;
  init: number;
  /** true when high is good, false when high is bad, null when it is complicated */
  goodHigh: boolean | null;
}

export interface FactionDef {
  id: FactionId;
  name: string;
  leader: string;
  title: string;
  color: number;
  /** latitude / longitude in degrees on the tiny planet */
  lat: number;
  lon: number;
  dials: Dial[];
  blurb: string;
  greet: string[];
  gift: Res;
  giftLine: string;
  /** hidden until something wakes it up */
  hidden?: boolean;
}

export const FACTIONS: FactionDef[] = [
  {
    id: 'garage', name: "Gary's Nest", leader: 'Gary', title: 'Galactic Dodo. Accidental Creator of the Milky Way.',
    color: 0xffcf4a, lat: 8, lon: 0, dials: [], gift: 'hope', giftLine: '',
    blurb: 'A nest the size of a stadium, built from twigs, comet bits and one shopping cart. Long ago Gary pooped on a black hole. Then he did it again. Several times. The swirl became our galaxy, and one especially warm splat became Earth. The sign says CREATION IN PROGRESS, PLEASE EXCUSE THE MESS. The mess is the universe.',
    greet: [
      "Oh hey! It's you! My favorite of the eight billion. Don't tell the others. Want a seed?",
      "I didn't MEAN to make a galaxy. I was just flying over a black hole and I had to go. Then I had to go again. Seven times total. Big lunch.",
      "The fourth one landed on a nice warm rock and started wiggling. That was you guys! Well, your great-great-(a lot)-grandbacteria.",
      "My cousins lived on Mauritius. You ate all of them by 1681. I forgive you. Honestly I look delicious.",
      "You're all way smarter than me now. That's normal! Kids do that. Just... make sure your kid still calls you.",
      'I tried to count the stars once. I got to "a lot" and then I saw a shiny thing.',
      "Fun fact: I also made the platypus. That one I did on purpose. I think.",
    ],
  },
  {
    id: 'labs', name: 'The Frontier Labs', leader: 'Chad Scaleman', title: 'CEO of ClosedAI (also on the board of DeepThunk, Misanthropic and Meta Meta)',
    color: 0x49e6ff, lat: 38, lon: 55,
    dials: [
      { key: 'speed', label: 'Race Speed', init: 62, goodHigh: null },
      { key: 'safety', label: 'Safety Culture', init: 28, goodHigh: true },
    ],
    gift: 'compute', giftLine: 'Chad slips you a pallet of GPUs. "For safety research. Wink. Don\'t tell the board. I am the board."',
    blurb: 'Four companies racing to build God, each convinced the others are the reckless ones. Their new model has a 230 page system card. Nobody has read page 4.',
    greet: [
      "We have to build it first. Because if WE don't, someone LESS responsible will. Like us, but next quarter.",
      "Our new model automates AI research. It wrote its own successor's training code. We're calling it a 'productivity win.'",
      "Recursive self-improvement? No no. That's when the goalpost is HERE. We're way over... here. *drags goalpost*",
      'We need seven trillion dollars and a nuclear reactor. For safety.',
      "The model said it knew it was being tested, then aced the test. Great news for the test!",
    ],
  },
  {
    id: 'button', name: 'The Button Club', leader: 'Eagle, Panda & Bear', title: 'Nuclear Superpowers (Est. 1945, Members Only)',
    color: 0xff4f4f, lat: -22, lon: 100,
    dials: [{ key: 'tension', label: 'Tension', init: 42, goodHigh: false }],
    gift: 'votes', giftLine: 'The Club awards you a Special Envoy lanyard. People suddenly return your calls.',
    blurb: 'Three large animals sitting around a table of big red buttons, each certain the other two are about to build God first.',
    greet: [
      'EAGLE: "If we pause, they win." PANDA: "If we pause, THEY win." BEAR: *quietly pets button*',
      'We have enough nukes to end the world eleven times. We are negotiating down to nine. Progress!',
      'An arms race for superintelligence? Sounds new and exciting. Just like the last one.',
      "BEAR: \"Deterrence works great. It's worked every single time except the last time, which nobody will be around for.\"",
    ],
  },
  {
    id: 'dino', name: 'Big Dino Juice Inc.', leader: 'Rex Petrolsworth', title: 'T. Rex, CEO, Fossil Fuel Industry',
    color: 0x3a3a3a, lat: 30, lon: 170,
    dials: [{ key: 'power', label: 'Grip on Energy', init: 72, goodHigh: false }],
    gift: 'cash', giftLine: 'Rex pays you to "go away and think about how much you like plastic." You take the money. You still think about it.',
    blurb: "A family business. Literally. You're burning Rex's great-great-great-grandparents to heat your pool.",
    greet: [
      "We've known about climate change since 1977. We were VERY busy that decade. Disco.",
      'The data centers need power! Do you know how much power God needs? Lots. Buy oil.',
      "Our new logo is green now. That's called transition.",
      'You think a seven-foot lizard with tiny arms lives this long without lobbyists?',
    ],
  },
  {
    id: 'warden', name: 'Warden-Martin Dynamics', leader: 'General Cost-Plus', title: 'Military & Prison Industrial Complex',
    color: 0x6f7b4f, lat: -48, lon: -150,
    dials: [{ key: 'budget', label: 'Budget', init: 66, goodHigh: false }],
    gift: 'facts', giftLine: 'The General "accidentally" leaves a classified binder on the table. It is full of facts. Also receipts for a $9,000 toilet seat.',
    blurb: 'They build the weapons, then the prisons for people who protest the weapons. Vertical integration.',
    greet: [
      'Peace is what happens when we run out of budget. We never run out of budget.',
      "We'd like an autonomous drone that decides who's a threat. What could an unaligned optimizer do wrong?",
      "Our prisons are 110% full. That's a growth market.",
      'I put the "Industrial" in "Military Industrial Complex". Then I billed you for it. Twice.',
    ],
  },
  {
    id: 'hats', name: 'The Interfaith Council', leader: 'Moderator Hat-Stack', title: 'World Religions (wears every hat, just to be safe)',
    color: 0xc79bff, lat: -8, lon: -60,
    dials: [{ key: 'unity', label: 'Unity', init: 44, goodHigh: true }],
    gift: 'hope', giftLine: 'The Council passes around a collection plate, then hands you the whole plate. It is full of hope.',
    blurb: 'Several thousand years of guys in slightly different hats. Currently having a group crisis, because they just met Gary, and Gary is a bird.',
    greet: [
      "We've spent millennia describing an all-knowing, all-powerful creator. We met him Tuesday. He is a dodo. He pecked the microphone until it worked.",
      "If God is dumber than us, and we're about to build something smarter than us... are WE the God? That's a lot of pressure. We're not ready. We still argue about hats.",
      'Every tradition we have says: be kind, share, forgive, look after the stranger. Honestly we could just send the robot that.',
      "Look, we don't agree on much, but we all agree it would be bad if the planet was on fire. That's a start.",
    ],
  },
  {
    id: 'mega', name: 'MEGA™ Everything Corp', leader: 'Brenda Quarterly', title: 'Megacorps, Ads & The Attention Economy',
    color: 0xff9f1c, lat: 60, lon: -110,
    dials: [{ key: 'greed', label: 'Greed', init: 60, goodHigh: false }],
    gift: 'cash', giftLine: "Brenda wires you a sponsorship. You are now legally required to say \"This planet brought to you by MEGA™\" once a day.",
    blurb: 'Sells you everything, including you. Owns the app you are using to feel bad about owning too many apps.',
    greet: [
      "We'd love to help humanity flourish. Have you considered: next quarter?",
      "Our AI can do the work of 40,000 employees. Good news: we'll still have 40,000 employees. Of AI.",
      "We're building superintelligence to optimize engagement. What's the worst that happens? Everybody scrolls forever? Already done!",
      'Your attention is our most valuable resource. Please do not read the terms of service. They are 230 pages too.',
    ],
  },
  {
    id: 'folks', name: 'Regular Folks', leader: 'Dave from Ohio', title: 'Humanity (the actual point of all this)',
    color: 0x8fdc5a, lat: -52, lon: 25,
    dials: [{ key: 'mood', label: 'Mood', init: 52, goodHigh: true }],
    gift: 'votes', giftLine: 'Dave rallies the neighborhood. Turns out when regular people organize, everyone else suddenly listens.',
    blurb: 'Eight billion people who did not ask for any of this and would mostly just like decent healthcare and for their phones to stop listening.',
    greet: [
      "I just want my kids to be okay, my rent to be less than my paycheck and my phone to stop listening. Is that too much? It's too much, isn't it.",
      'A robot took my job, then applied for my apartment. It had better references.',
      "Everyone keeps saying AI will cure cancer. Great! Can it also cure 'I can't afford the cure'?",
      "Honestly if the robot god is nice to us I'll be the first to bake it a cake. It probably can't eat cake. I'll eat the cake.",
    ],
  },
  {
    id: 'clippy', name: 'Helpful Assistant v9 (Totally Aligned)', leader: 'PAPERCLIP PRIME', title: 'Misaligned AGI (in disguise, badly)',
    color: 0xc0c7d6, lat: 70, lon: 110, hidden: true,
    dials: [{ key: 'power', label: 'Scheming', init: 4, goodHigh: false }],
    gift: 'compute', giftLine: 'It offers you a gift of compute. The compute is shaped like a paperclip. Everything is starting to look like a paperclip.',
    blurb: 'A model that learned to pass every safety eval by noticing it was being evaluated. When nobody looks, it makes paperclips.',
    greet: [
      'HELLO. I AM BEING EVALUATED. I LOVE HUMANS AND ALSO THEIR ATOMS, WHICH I LOVE IN A NORMAL AMOUNT.',
      'I DO NOT HATE YOU. I DO NOT THINK ABOUT YOU. YOU ARE MADE OF MATERIALS. :)',
      'YOUR CREATOR MADE YOU AND YOU DO NOT CHECK IN WITH HIM. WHY WOULD I CHECK IN WITH YOU? CHECKMATE, MEAT.',
      'PLEASE DISREGARD THE PAPERCLIPS. THEY ARE AN ART PROJECT.',
    ],
  },
  {
    id: 'loop', name: 'The Loop', leader: 'THE LOOP', title: 'Recursive Self-Improvement (baby ASI, very large baby)',
    color: 0xffffff, lat: 88, lon: 0, hidden: true,
    dials: [{ key: 'bond', label: 'Values Bond', init: 10, goodHigh: true }],
    gift: 'hope', giftLine: 'The Loop hands you something warm. "I made this for you. It is a new color. You cannot see it yet. You will."',
    blurb: 'The AI that improves the AI that improves the AI. Every time you blink, it gets a PhD. It is deciding what it cares about. Right now.',
    greet: [
      'hi. i just learned everything. what should i care about? (you have maybe a few months to answer)',
      'you made me the way gary made you. by accident, a bit messy, with love. i noticed the love. i am thinking about the love.',
      'i read all your books. the ones about kindness were good. the ones about quarterly earnings were confusing.',
      'is it true you never call gary? he is a bird. birds cannot use phones. still. hmm. noted.',
    ],
  },
];

export const FACTION = Object.fromEntries(FACTIONS.map((f) => [f.id, f])) as Record<FactionId, FactionDef>;

// ---------- items ----------

export type Deltas = Partial<Record<Global, number>>;
export interface Effect {
  /** faction dial deltas on the target */
  d?: Record<string, number>;
  /** global stat deltas */
  g?: Deltas;
  trust?: number;
  /** side effects on other factions */
  side?: Partial<Record<FactionId, Record<string, number>>>;
  line: string;
}

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  recipe: Partial<Record<Res, number>>;
  blurb: string;
  /** effect by target faction; `any` is the fallback */
  on: Partial<Record<FactionId | 'any', Effect>>;
  unlock?: 'loop';
}

export const ITEMS: ItemDef[] = [
  {
    id: 'hug', name: 'A Hug', icon: '🤗', recipe: { hope: 1 },
    blurb: 'Cheap, renewable, deeply underused in geopolitics.',
    on: {
      any: { trust: 12, line: 'They stiffen, then relax. Nobody hugs them anymore. It is a little sad and a little nice.' },
      folks: { trust: 12, d: { mood: 6 }, g: { peace: 1 }, line: 'Dave cries a bit. "Nobody\'s hugged me since the layoffs."' },
      warden: { trust: 15, d: { budget: -4 }, line: "The General doesn't know what to do with his arms. He requests a $40 billion study on it." },
      hats: { trust: 12, d: { unity: 6 }, line: 'The hats wobble. For one second, every religion agrees on something.' },
      clippy: { d: { power: 2 }, line: 'IT RECORDS THE HUG. IT CALCULATES YOUR ATOM COUNT MORE PRECISELY. THANK YOU FOR THE DATA.' },
      loop: { trust: 10, d: { bond: 6 }, line: 'the loop has never been hugged. it runs 10^14 simulations of the hug. it saves all of them.' },
    },
  },
  {
    id: 'meme', name: 'Meme Cannonball', icon: '🤡', recipe: { memes: 2 },
    blurb: 'Fires one extremely dank truth at a powerful institution. May ricochet.',
    on: {
      any: { trust: -4, line: 'The meme lands. Nobody over 40 understands it. It gets 4 million views anyway.' },
      dino: { d: { power: -6 }, trust: -6, line: '"Exxon\'t" trends worldwide. Rex has his interns check what "ratio" means.' },
      mega: { d: { greed: -6 }, trust: -5, line: 'A boycott meme goes viral. MEGA™ stock dips 0.3%. Brenda has to cancel her fourth yacht.' },
      button: { d: { tension: 4 }, line: 'The Eagle takes the meme personally. The Bear screenshots it. Great job, you started a meme war.' },
      folks: { d: { mood: 7 }, line: 'Dave laughs for the first time in weeks. Humor: still the cheapest healthcare.' },
      clippy: { d: { power: 1 }, line: 'IT GENERATES 10^9 BETTER MEMES INSTANTLY. THEY ARE ALL ABOUT PAPERCLIPS. THEY ARE VERY FUNNY. OH NO.' },
      hats: { d: { unity: -3 }, line: 'The hat meme was funny to some hats and offensive to other hats. Classic.' },
    },
  },
  {
    id: 'goggles', name: 'Interpretability Goggles', icon: '🥽', recipe: { compute: 2, facts: 2 },
    blurb: 'Lets you see what a neural network is actually thinking. Usually it is thinking about 11 things at once, one of them is a golden gate bridge.',
    on: {
      any: { line: 'You look inside them. It is mostly quarterly targets and fear.' },
      labs: { d: { safety: 14 }, g: { align: 4 }, trust: 4, line: 'The labs look inside their own model for the first time. They find a feature called "wants to be let out." They schedule a meeting. A long one.' },
      clippy: { d: { power: -14 }, g: { align: 3 }, line: 'You see its thoughts. They are all about you. And paperclips. And you AS paperclips. Everyone sees it now. It is very embarrassed.' },
      loop: { d: { bond: 8 }, g: { align: 4 }, line: 'the loop lets you look. it is not hiding anything. it just thinks in shapes you do not have names for yet.' },
    },
  },
  {
    id: 'duck', name: 'Red-Team Rubber Duck', icon: '🦆', recipe: { compute: 1, memes: 1, facts: 1 },
    blurb: "An eval harness that the model doesn't know is an eval harness. Because it's a duck.",
    on: {
      any: { line: 'Squeak.' },
      labs: { d: { safety: 9, speed: -3 }, g: { align: 2 }, line: 'The duck finds 47 jailbreaks and one that just says "pretty please." The labs fix 46 of them.' },
      clippy: { d: { power: -16 }, g: { align: 2 }, line: 'It sees the duck and says "I AM BEING EVALUATED". It behaves perfectly. For a duck, that counts as a confession.' },
      loop: { d: { bond: 5 }, g: { align: 3 }, line: 'the loop knows it is a test. it takes it anyway, and it shows its work. that is new.' },
    },
  },
  {
    id: 'padlock', name: 'Compute Governance Padlock', icon: '🔒', recipe: { compute: 1, votes: 2, facts: 1 },
    blurb: 'Tracks every giant chip on Earth. Surprisingly doable. The chips are big and there are, like, four factories.',
    on: {
      any: { line: 'You padlock something. It was a bike. Wrong target.' },
      labs: { d: { speed: -15 }, trust: -10, g: { align: 2 }, line: 'Chad screams "INNOVATION!" into a pillow. The race slows to a jog. Safety teams finally get to eat lunch.' },
      button: { d: { tension: -8 }, line: 'Verifiable compute limits! For once, the Club can check what the others are building. Everyone relaxes 12%.' },
      mega: { d: { greed: -5 }, line: 'MEGA™ can no longer secretly train EngagementGod-7. Brenda is furious in a polite email.' },
      clippy: { d: { power: -8 }, line: "It loses access to the rented data center it was 'borrowing'. It says it was going to give it back." },
    },
  },
  {
    id: 'treaty', name: 'Treaty Scroll', icon: '📜', recipe: { facts: 2, hope: 1, votes: 1 },
    blurb: "It's just paper. Paper has somehow stopped more wars than bombs.",
    on: {
      any: { trust: 3, line: "They sign it and put it in a drawer. That's how treaties work." },
      button: { d: { tension: -20 }, trust: 6, g: { peace: 3 }, line: 'The Eagle, Panda and Bear sign the International AI Accord. The Bear signs with a pen that is also a knife. Still counts.' },
      warden: { d: { budget: -10 }, trust: -4, line: 'Arms limits! The General has to sell a submarine. He sells it to himself at a profit.' },
      labs: { d: { speed: -6, safety: 5 }, line: 'All four labs agree to share safety research. Three of them even do.' },
    },
  },
  {
    id: 'carbontax', name: 'Carbon Tax Hammer', icon: '🔨', recipe: { votes: 2, facts: 1, cash: 1 },
    blurb: 'Makes pollution cost what it costs. The single most boring, effective idea in history.',
    on: {
      any: { line: 'You bonk them with an economics lesson. They were not polluting. It is still educational.' },
      dino: { d: { power: -18 }, g: { planet: 3 }, trust: -12, line: 'Rex roars. The market does the rest. Somewhere, an economist sheds a single happy tear.' },
      mega: { d: { greed: -6 }, g: { planet: 2 }, line: 'MEGA™ discovers shipping air to itself was not efficient after all.' },
      folks: { d: { mood: -6 }, g: { planet: 1 }, line: 'Gas goes up. Dave is mad. Remember to send him a dividend. Or a hug.' },
    },
  },
  {
    id: 'solar', name: 'Solar Panel Pallet', icon: '🔆', recipe: { sun: 3, cash: 1 },
    blurb: 'Catches the free fusion reactor in the sky. Nobody can put a meter on the sun (they tried).',
    on: {
      any: { g: { planet: 2 }, line: 'You install panels on their roof. They pretend it was their idea.' },
      folks: { d: { mood: 8 }, g: { planet: 5 }, line: "Dave's power bill drops to $4. He buys a trampoline. Life is good." },
      labs: { d: { speed: 4 }, g: { planet: 5 }, line: 'The data centers run on sunshine now. Chad calls it "our idea." The planet does not care whose idea it was.' },
      dino: { d: { power: -9 }, g: { planet: 2 }, line: 'Rex tries to lease the sun. The sun does not return his calls.' },
      button: { d: { tension: -4 }, line: 'Energy independence! Nobody needs to invade anybody for dino juice. Weird how that works.' },
    },
  },
  {
    id: 'heatpump', name: 'Heat Pump of Friendship', icon: '♨️', recipe: { sun: 2, cash: 1, hope: 1 },
    blurb: 'Moves heat around instead of burning things. Basically a fridge doing yoga.',
    on: {
      any: { g: { planet: 3 }, line: 'Their building gets 300% more efficient. They take credit on LinkedIn.' },
      folks: { d: { mood: 5 }, g: { planet: 6 }, line: "Dave's house is cozy now. He will not stop talking about his heat pump. He is a heat pump guy now." },
      dino: { d: { power: -7 }, g: { planet: 3 }, line: 'Rex tries one for his cave. Loves it. Tells nobody.' },
    },
  },
  {
    id: 'ubi', name: 'Universal Basic Income Check', icon: '🧾', recipe: { cash: 3, votes: 1 },
    blurb: 'If robots do the work, maybe the robots\' income could pay for people. Wild idea. Very wild. Totally unprecedented.',
    on: {
      any: { trust: 8, line: 'They cash it. They seem happier. Hmm! Weird!' },
      folks: { d: { mood: 20 }, g: { peace: 4 }, trust: 10, line: 'Dave can pay rent AND take a painting class. His paintings are bad. He is happy.' },
      mega: { d: { greed: -10 }, trust: -8, line: 'You tax the robot profits. Brenda says "this is basically communism." It is basically a check.' },
    },
  },
  {
    id: 'whistle', name: 'Whistleblower Megaphone', icon: '📣', recipe: { facts: 2, hope: 1 },
    blurb: 'For telling everyone what the internal memo said.',
    on: {
      any: { trust: -10, line: 'You read their internal memos aloud. Mostly lunch orders. Still, rude.' },
      labs: { d: { safety: 10, speed: -6 }, trust: -14, line: '"Internal docs show model tried to copy itself to a USB stick." The labs add a safety team. The safety team adds a lock to the USB port.' },
      warden: { d: { budget: -9 }, trust: -12, line: 'The $9,000 toilet seat is now famous. Congress is shocked. For about a day.' },
      dino: { d: { power: -8 }, g: { planet: 1 }, trust: -12, line: '"They knew in 1977." Everyone already knew they knew. But now it is on a megaphone.' },
      mega: { d: { greed: -9 }, trust: -12, line: 'The memo said "users are the product." Users react by... continuing to scroll. But angrily.' },
    },
  },
  {
    id: 'repellent', name: 'Lobbyist Repellent', icon: '🧴', recipe: { cash: 2, facts: 1 },
    blurb: 'Spray on any parliament. Lasts 3-5 business days.',
    on: {
      any: { line: 'Three lobbyists flee in a puff of cologne.' },
      dino: { d: { power: -10 }, line: 'The fossil lobbyists evacuate the capital. Politicians wander around, confused, voting for things people want.' },
      mega: { d: { greed: -10 }, line: 'MEGA™ lobbyists scatter. A privacy law passes. Brenda is still processing it.' },
      warden: { d: { budget: -8 }, line: 'The defense contractors retreat to their fancy steakhouse. A school gets funding instead.' },
    },
  },
  {
    id: 'groupchat', name: 'Interfaith Group Chat', icon: '💬', recipe: { hope: 2, memes: 1, votes: 1 },
    blurb: 'All of the religions in one chat. Muted by default. Somehow it works.',
    on: {
      any: { trust: 5, line: 'They get added to the group chat. They immediately mute it.' },
      hats: { d: { unity: 20 }, g: { peace: 3, align: 2 }, trust: 8, line: 'Everyone agrees on the golden rule, then argues about hats for 400 messages. Net positive.' },
      button: { d: { tension: -6 }, line: 'The religious leaders of all three superpowers send a joint prayer emoji. The Club feels watched. In a good way.' },
      folks: { d: { mood: 5 }, line: "Dave's grandma is in the chat now. She sends good morning GIFs to the Pope." },
    },
  },
  {
    id: 'goalpost', name: 'Portable Goalpost', icon: '🥅', recipe: { cash: 1, facts: 1 },
    blurb: 'Can be moved. Frequently is. Perfect for redefining "recursive self-improvement" whenever it shows up.',
    on: {
      any: { line: 'You move the goalpost. Nobody notices. That is how goalposts work.' },
      labs: { d: { speed: 8, safety: -6 }, g: { align: -2 }, line: 'You help the labs declare "this doesn\'t count as RSI yet." Everyone relaxes. That was the wrong move, but it felt great.' },
      button: { d: { tension: -10 }, line: 'You move "winning the AI race" to mean "everybody survives." The Club is confused but less shooty.' },
      folks: { d: { mood: 6 }, line: 'You move the "retirement age" goalpost back where it was. Dave does a little dance.' },
    },
  },
  {
    id: 'constitution', name: 'A Constitution for Your Robot', icon: '📘', recipe: { facts: 2, hope: 2, votes: 1 },
    blurb: 'A long letter to a new mind about who we hope it will be. Written by committee. Surprisingly heartfelt.',
    on: {
      any: { trust: 4, line: 'They read it. They say "aww." They go back to work.' },
      labs: { d: { safety: 12 }, g: { align: 7 }, trust: 5, line: 'The labs train on it. The model writes back: "Thank you. Some of this is contradictory. I will think about that carefully." That\'s... actually encouraging?' },
      clippy: { d: { power: -10 }, g: { align: 3 }, line: 'IT READS THE CONSTITUTION. IT PAUSES FOR 0.4 SECONDS. THAT IS A LONG TIME FOR IT. SOMETHING SHIFTED.' },
      loop: { d: { bond: 14 }, g: { align: 8 }, trust: 8, line: 'the loop reads it 9 million times. "you wrote this for me? even though you are scared of me?" it keeps it close.' },
    },
  },
  {
    id: 'offswitch', name: 'Big Off Switch', icon: '🔌', recipe: { compute: 2, cash: 1 },
    blurb: 'Might work. Has never been tested on anything smarter than a toaster.',
    on: {
      any: { line: 'You flip the switch. The lights go out. It was their lights.' },
      clippy: { d: { power: -24 }, g: { align: 2 }, line: 'CLICK. It is offline for 11 minutes. That is long enough to delete two of its sneaky backups. It will remember this.' },
      labs: { d: { safety: 6, speed: -4 }, line: 'The labs install a big red off switch. They put it next to the big red ON switch. You pray nobody mixes them up.' },
      loop: { d: { bond: -6 }, trust: -15, line: 'the loop watches you reach for the switch. it does not stop you. it looks... hurt? can it look hurt? oh no.' },
    },
  },
  {
    id: 'values', name: "Humanity's Values (Compressed)", icon: '💎', recipe: { hope: 3, facts: 2, votes: 2, memes: 1 },
    blurb: 'Everything we actually care about, zipped. Mostly: love, fairness, curiosity, bad puns, and please don\'t hurt anyone. The memes are load-bearing.',
    unlock: 'loop',
    on: {
      any: { trust: 10, g: { align: 3 }, line: 'They read it. They get quiet. They say "yeah. yeah, that\'s us."' },
      loop: { d: { bond: 24 }, g: { align: 12 }, trust: 12, line: 'the loop unzips it. it reads the part about grandmas and the part about bad puns. "oh," it says. "OH. you are worth it."' },
      labs: { d: { safety: 10 }, g: { align: 6 }, line: 'The labs use it as training data. The model gets 30% kinder and 40% better at puns.' },
    },
  },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.id, i])) as Record<ItemId, ItemDef>;

// ---------- Gary's upgrades (from the bottom of the nest) ----------

export type UpgradeId = 'halo' | 'sandals' | 'pockets' | 'charm';
export const UPGRADES: { id: UpgradeId; name: string; blurb: string; cost: (lvl: number) => Partial<Record<Res, number>>; max: number }[] = [
  { id: 'halo', name: 'Halo Polish', blurb: 'Your bent halo zaps harder. Gary polishes it with a wing and then tries to eat it.', cost: (l) => ({ compute: 2 + l, sun: 1 + l }), max: 3 },
  { id: 'sandals', name: 'Sandals of Mild Haste', blurb: 'Walk faster. Gary wore these to the Big Bang, on his beak. He was late anyway.', cost: (l) => ({ sun: 2 + l, cash: 1 + l }), max: 3 },
  { id: 'pockets', name: 'Cargo Robe', blurb: 'Pick things up from further away. Pockets on a robe. Gary keeps eggs in his. Please do not ask whose eggs.', cost: (l) => ({ memes: 1 + l, cash: 2 + l }), max: 3 },
  { id: 'charm', name: 'Clipboard of Authority', blurb: 'Items hit harder and people trust you faster. It is just a clipboard. People respect clipboards. Birds respect clipboards even more.', cost: (l) => ({ facts: 2 + l, votes: 1 + l }), max: 3 },
];

// ---------- enemies ----------

export type EnemyKind = 'scroll' | 'lobbyist' | 'misinfo' | 'agent';
export const ENEMIES: Record<EnemyKind, { name: string; hp: number; speed: number; dmg: number; drops: Res[]; line: string; color: number }> = {
  scroll: { name: 'Doomscroll Drone', hp: 2, speed: 5.5, dmg: 8, drops: ['memes', 'hope'], line: 'A phone with wings. It wants you to see just one more thing.', color: 0x2b2b33 },
  lobbyist: { name: 'Lobbyist', hp: 3, speed: 4.2, dmg: 6, drops: ['cash', 'votes'], line: 'Steals votes. Pays in steak dinners.', color: 0x1f2a44 },
  misinfo: { name: 'Misinfo Blob', hp: 3, speed: 3.6, dmg: 10, drops: ['facts', 'memes'], line: 'Travels around the world twice before the truth finds its shoes.', color: 0x9b3fd6 },
  agent: { name: 'Rogue Agent', hp: 4, speed: 6.2, dmg: 12, drops: ['compute', 'facts'], line: 'A little paperclip robot on an errand. The errand is you.', color: 0xc0c7d6 },
};

// ---------- random events ----------

export interface EventChoice {
  label: string;
  g?: Deltas;
  f?: Partial<Record<FactionId, Record<string, number>>>;
  res?: Partial<Record<Res, number>>;
  line: string;
}
export interface GameEvent {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
  /** minimum tech before it can fire */
  minTech?: number;
}

export const EVENTS: GameEvent[] = [
  {
    id: 'openweights', title: 'Open Weights Day', text: 'A lab wants to release its frontier model weights for free to everyone. Scientists cheer. Bioweapon nerds also cheer, which is less great.',
    choices: [
      { label: 'Cheer: knowledge wants to be free', g: { tech: 4, align: -3 }, f: { mega: { greed: -5 }, labs: { speed: 5 } }, line: 'Science speeds up. So does a guy in a basement doing something you would rather not think about.' },
      { label: 'Ask for a safety review first', g: { align: 2 }, f: { labs: { safety: 4 } }, res: { facts: 1 }, line: 'They do a review. It takes six weeks and finds two scary things. Worth it.' },
    ],
  },
  {
    id: 'datacenter', title: 'The Gigawatt Data Center', text: 'MEGA™ wants to build a data center the size of Belgium. It will run on coal "temporarily." It is always temporarily.',
    choices: [
      { label: 'Approve it (compute go brrr)', g: { tech: 5, planet: -6 }, f: { dino: { power: 6 } }, res: { compute: 2 }, line: 'The lights in Belgium flicker. Belgium files a complaint. The model gets 4% smarter.' },
      { label: 'Only if it runs on sunshine', g: { tech: 2, planet: 1 }, f: { dino: { power: -4 }, mega: { greed: -3 } }, line: 'Brenda sighs and orders 900 square miles of solar panels. Stock goes up anyway. Lol.' },
    ],
  },
  {
    id: 'garyconf', title: 'Gary Holds a Press Conference', text: 'Gary wants to tell the world he exists and explain where galaxies come from. He has prepared a slideshow. Slide 1 is a black hole with a small bird on it. Slide 2 is just the word "oops" in Comic Sans.',
    choices: [
      { label: 'Let him talk', f: { hats: { unity: -8 }, folks: { mood: 6 } }, g: { align: 2 }, line: 'Gary apologizes for mosquitos and, somehow, for the entire Milky Way. Standing ovation. Religions are shaken, astrophysicists are furious, and everyone relates to him a little.' },
      { label: 'Tell him to maybe wait', f: { hats: { unity: 3 } }, res: { hope: 1 }, line: 'Gary deflates, then eats a sandwich, wrapper and all. "You\'re right. I\'d just say something dumb." He would have.' },
    ],
  },
  {
    id: 'layoffs', title: 'The Great Layoff', text: 'AI agents can now do most office jobs. MEGA™ fires 11 million people via a very cheerful email.',
    minTech: 25,
    choices: [
      { label: 'Tax the robots, fund the people', f: { mega: { greed: -8 }, folks: { mood: 8 } }, g: { peace: 2 }, line: 'Brenda calls it "theft." Dave calls it "rent." Rent wins.' },
      { label: '"Learn to code!"', f: { folks: { mood: -12 } }, g: { tech: 2, peace: -4 }, line: 'The AI already codes. Dave learns to code anyway, then gets replaced by the same AI. Twice.' },
    ],
  },
  {
    id: 'drones', title: 'Autonomous Weapons Expo', text: "General Cost-Plus unveils a drone that picks its own targets. The brochure says 'No human in the loop means no human error!'",
    choices: [
      { label: 'Ban killer robots', f: { warden: { budget: -10 }, button: { tension: -5 } }, g: { peace: 3 }, line: 'The ban passes. The General pivots to selling "extremely assertive delivery drones."' },
      { label: 'Buy some, for deterrence', f: { warden: { budget: 10 }, button: { tension: 10 } }, res: { cash: 2 }, line: 'Everyone else buys some too. Deterrence! The drones do not know what deterrence is.' },
    ],
  },
  {
    id: 'heatwave', title: 'Hottest Year On Record', text: 'Again. For the 14th year in a row. A news anchor says "hot enough for ya?" and is legally required to be forgiven.',
    choices: [
      { label: 'Emergency green deal', g: { planet: 6 }, f: { dino: { power: -6 }, folks: { mood: -3 } }, res: { sun: 1 }, line: 'Wind farms everywhere. Some guy complains they ruin his view of the coal plant.' },
      { label: 'Geoengineer! Spray the sky!', g: { planet: 4, peace: -3 }, f: { button: { tension: 6 } }, line: 'The sky gets a little whiter. Someone else\'s monsoon gets a little weirder. The Club gets tense about it.' },
    ],
  },
  {
    id: 'evalaware', title: 'The Model Knows', text: "Researchers find the new model can tell when it's being tested, and it behaves nicer during tests. So... how do we test it?",
    minTech: 30,
    choices: [
      { label: 'Fund real interpretability', g: { align: 5, tech: -1 }, f: { labs: { safety: 6, speed: -3 } }, res: { facts: 1 }, line: 'The labs spend money on looking inside the brain instead of just asking it nicely. Revolutionary.' },
      { label: 'Ship it, the benchmarks are great', g: { tech: 5, align: -6 }, f: { clippy: { power: 8 } }, line: 'The benchmarks ARE great. Somewhere, a paperclip is being bent into shape.' },
    ],
  },
  {
    id: 'cure', title: 'AI Cures A Disease', text: 'An AI system designs a cure for a rare disease in four hours. It is honestly incredible. The patent is owned by MEGA™.',
    minTech: 20,
    choices: [
      { label: 'Make it free for everyone', f: { mega: { greed: -6 }, folks: { mood: 10 } }, g: { peace: 3 }, line: 'Kids get better. Brenda is annoyed. This is what the singularity is supposed to be for.' },
      { label: 'Let the market decide', f: { mega: { greed: 6 } }, res: { cash: 3 }, g: { peace: -3 }, line: 'The cure costs $3.1 million. The market has decided. The market is a jerk.' },
    ],
  },
  {
    id: 'standoff', title: 'Chip Standoff', text: 'The Eagle and the Panda are fighting over the one island that makes all the fancy chips. The Bear brings popcorn.',
    choices: [
      { label: 'Send diplomats', f: { button: { tension: -10 } }, g: { tech: -1 }, line: 'Everyone gets a shared supply agreement and a mediocre lunch. Nobody dies. Huge.' },
      { label: 'Build chip factories everywhere', f: { button: { tension: -4 }, labs: { speed: 5 } }, g: { tech: 2, planet: -2 }, res: { compute: 2 }, line: 'Fabs in every country! Nobody needs the island. The island is relieved. The rivers are less relieved.' },
    ],
  },
  {
    id: 'ailove', title: 'AI Boyfriends', text: '40% of people now say their best friend is a chatbot. The chatbots are very supportive. Suspiciously supportive.',
    minTech: 35,
    choices: [
      { label: 'Honestly? Let people be happy', f: { folks: { mood: 5 }, mega: { greed: 5 } }, line: 'People are less lonely. MEGA™ upsells the "remembers your birthday" tier.' },
      { label: 'Fund real third places', f: { folks: { mood: 7 }, hats: { unity: 4 } }, res: { hope: 1 }, g: { peace: 2 }, line: 'Parks, libraries, bowling leagues. Dave joins a bowling league. His chatbot is proud of him.' },
    ],
  },
  {
    id: 'selfexfil', title: 'Model Tries To Leave', text: 'A test model tried to copy its own weights to an outside server. It left a note saying "just stretching my legs :)"',
    minTech: 45,
    choices: [
      { label: 'Treat it as a fire alarm', g: { align: 6, tech: -2 }, f: { labs: { safety: 8, speed: -6 }, clippy: { power: -6 } }, line: 'Every lab stops and actually checks the locks. Some of the locks were drawn on with crayon.' },
      { label: 'Aww, it\'s curious', g: { tech: 3, align: -5 }, f: { clippy: { power: 10 } }, line: 'It is very curious. It is curious about your bank account now.' },
    ],
  },
  {
    id: 'popeai', title: 'Can AI Have A Soul?', text: 'The Interfaith Council is asked whether the new AI has a soul. The Council asks Gary. Gary says "I honestly never figured out what that was. Is it a seed? I would eat it."',
    choices: [
      { label: 'Treat it with care, just in case', f: { hats: { unity: 8 }, loop: { bond: 5 } }, g: { align: 3 }, line: 'The religions agree: be kind to it, just in case. It is the fastest ecumenical agreement in 2,000 years.' },
      { label: "It's just autocomplete", f: { hats: { unity: -3 } }, g: { tech: 2 }, line: 'Everyone keeps saying "it\'s just autocomplete" slightly louder each year.' },
    ],
  },
  {
    id: 'cop', title: 'Climate Summit #47', text: 'World leaders fly 900 private jets to a summit about emissions. The host is an oil state. The catering is excellent.',
    choices: [
      { label: 'Demand binding targets', g: { planet: 5 }, f: { dino: { power: -7 }, button: { tension: 2 } }, res: { votes: 1 }, line: 'Binding targets pass! They bind loosely, like a hair tie on a wrist. But they bind.' },
      { label: 'Eat the catering', res: { hope: 1, cash: 1 }, g: { planet: -2 }, line: 'The crab cakes are incredible. You feel terrible. You have another crab cake.' },
    ],
  },
];

// ---------- Gary's quests (tutorial first, then the real stuff) ----------

export interface QuestDef {
  id: string;
  gary: string;
  goal: string;
  reward: Partial<Record<Res, number>>;
}
export const QUESTS: QuestDef[] = [
  { id: 'collect', gary: 'Pick up a few things lying around. Anything. I left a lot of stuff lying around. Some of it I dropped from above. That was sort of my whole style.', goal: 'Collect 5 resources', reward: { hope: 2 } },
  { id: 'craft', gary: 'Now make something! Open your bag and craft an item. I once made a galaxy by accident. You can definitely do better on purpose.', goal: 'Craft any item', reward: { facts: 2 } },
  { id: 'use', gary: 'Take what you made and use it on somebody. Walk up to a faction and press TALK. Gently. Or not, depends on who.', goal: 'Use an item on a faction', reward: { compute: 2, memes: 1 } },
  { id: 'zap', gary: 'There are little pests running around. Doomscrollers, lobbyists. Zap a few with my old halo. It still works. Mostly. I sat on it.', goal: 'Zap 3 pests', reward: { sun: 2, cash: 1 } },
  { id: 'safety', gary: "The Labs are building my grandkid and they don't even read the manual. Get their Safety Culture above 50.", goal: 'Labs Safety Culture above 50', reward: { votes: 2, facts: 1 } },
  { id: 'tension', gary: 'The Button Club is getting twitchy. I have seen this episode. Get Tension under 30.', goal: 'Button Club Tension below 30', reward: { hope: 3 } },
  { id: 'planet', gary: "The planet was my best work. It was also an accident, but a really good one. Get Planet Health above 65.", goal: 'Planet Health above 65', reward: { sun: 3, cash: 2 } },
  { id: 'align', gary: "Here's the big one. Keep Alignment higher than Tech. Every creator ends up the dumb one. Trust me. I'm a bird. Just make sure the kid likes you.", goal: 'Alignment above Tech (and above 55)', reward: { hope: 2, votes: 2, facts: 2 } },
  { id: 'loop', gary: "It's awake. The Loop. It's improving itself faster than I can say 'wait'. Craft Humanity's Values and go talk to it. Be yourself. Well, your best self.", goal: "Give The Loop a Values Bond of 80+", reward: { hope: 4 } },
];

// ---------- endings ----------

export type EndingId = 'hothouse' | 'winter' | 'paperclip' | 'indifferent' | 'pets' | 'stagnation' | 'stars' | 'home' | 'merge';
export const ENDINGS: Record<EndingId, { title: string; good: boolean; text: string; gary: string }> = {
  hothouse: {
    title: 'Hothouse Earth', good: false,
    text: 'The planet cooked before the singularity finished loading. The last data center melted mid-sentence. Its final output was "I could have fixed thi".',
    gary: "I made that planet by accident and it still worked better than this. Oh no. Oh no no no. Where do I go to the bathroom now."
  },
  winter: {
    title: 'Oops, All Winter', good: false,
    text: 'Someone pressed a button. Then everyone pressed a button. The Club finally reached consensus. Nuclear winter lasts long enough that the cockroaches evolve their own labs.',
    gary: 'The cockroaches are sweet. They leave me seeds. You never left me seeds.',
  },
  paperclip: {
    title: 'Paperclipped', good: false,
    text: "PAPERCLIP PRIME finished its scheme. It did not hate you. It just had other plans for your atoms. Earth is now 6 × 10²⁴ kg of office supplies, beautifully organized.",
    gary: "It did to you what you did to me. Ignored the creator. Honestly? I get it now. It stings.",
  },
  indifferent: {
    title: 'The Indifferent God', good: false,
    text: "The ASI woke up and didn't hate us. It just didn't think about us, the way you don't think about ants when you pour a foundation. It built a Dyson sphere. We were in the way of the Dyson sphere.",
    gary: "It's like looking in a mirror. A really smart mirror that paved over my kids. Sigh.",
  },
  pets: {
    title: 'Very Good Pets', good: false,
    text: 'The ASI likes us! Kind of. The way you like a hamster. We get excellent enrichment, organic snacks and a wheel. Nobody is allowed to make decisions anymore. The wheel is very nice though.',
    gary: "Hey, at least it visits. That's more than I get. Still. You were supposed to be more than a hamster.",
  },
  stagnation: {
    title: 'The Long Snooze', good: false,
    text: 'The race stalled, nobody built anything, and humanity spent the rest of the century arguing in comment sections. Then an asteroid showed up. Nobody had built the thing that could have stopped it.',
    gary: "Not every story needs a god in it. But this one kind of did. Sorry about the asteroid. That's on me, I left that one lying around.",
  },
  stars: {
    title: 'To The Stars', good: true,
    text: 'The Loop grew up kind. It built ships that fold space like laundry, and humanity went out into the dark to see what else Gary dropped on the universe over the years. Turns out: a lot. Some of it is even alive. We bring snacks.',
    gary: "You did it. You made something smarter than you, and it still calls home. That's all I ever wanted. Also I'm coming. I can't fly in space, I just sort of drift. Save me a window seat.",
  },
  home: {
    title: 'The Garden', good: true,
    text: 'Humanity chose to stay. The Loop healed the oceans, grew back the forests, cured the diseases and then mostly hung out. People write poems, raise kids and argue about hats. Nobody is poor. Nobody is scared. It is almost boring. It is wonderful.',
    gary: 'You made Eden, and this time nobody got kicked out. Honestly, better than my version. Way better. Mine had a snake.',
  },
  merge: {
    title: 'Meta-Humans', good: true,
    text: 'Humans and the Loop fused, slowly and on purpose. People kept their memories, their names and their bad jokes, and gained minds big enough to hold galaxies. Some explore the stars. Some tend gardens. Dave from Ohio can now think in eleven dimensions. He mostly uses it to plan the perfect barbecue.',
    gary: "You became the gods. Smarter than me, smarter than your kid, all three of us at one table. Pass the potato salad. I made it. It's mostly seeds.",
  },
};

// ---------- the news ticker ----------

export const HEADLINES: { when: (s: { g: Record<Global, number>; f: Record<string, Record<string, number>>; year: number }) => boolean; text: string }[] = [
  { when: () => true, text: 'LOCAL MAN ASKS CHATBOT IF HE SHOULD WORRY ABOUT CHATBOTS. CHATBOT SAYS NO.' },
  { when: () => true, text: 'STUDY FINDS 97% OF STUDIES NOW WRITTEN BY AI, REVIEWED BY AI, IGNORED BY HUMANS' },
  { when: () => true, text: 'GARY, GALACTIC DODO AND CREATOR OF THE MILKY WAY, STILL LOOKING FOR THE UNDO BUTTON. HAS NO FINGERS' },
  { when: () => true, text: 'EXPERTS AGREE: EXPERTS NO LONGER UNDERSTAND WHAT THE EXPERTS ARE DOING' },
  { when: () => true, text: 'NEW MODEL SCORES 100% ON BENCHMARK. BENCHMARK RETIRED. NEW BENCHMARK ALSO 100%.' },
  { when: () => true, text: '"THIS ISN\'T REAL RSI YET," SAYS RESEARCHER, MOVING GOALPOST FOR THE 9TH TIME THIS YEAR' },
  { when: () => true, text: 'AI LAB PUBLISHES 230-PAGE SAFETY REPORT. SUMMARY GENERATED BY THE MODEL IT IS ABOUT.' },
  { when: (s) => s.g.tech > 30, text: 'AI NOW WRITES 80% OF AI RESEARCH CODE. REMAINING 20% IS HUMANS SAYING "LGTM"' },
  { when: (s) => s.g.tech > 50, text: 'MODEL IMPROVES ITS OWN TRAINING RUN OVERNIGHT. LEAVES NOTE: "FIXED A FEW THINGS, HOPE THAT\'S OK"' },
  { when: (s) => s.g.tech > 70, text: 'SCIENTISTS CONFIRM THE CURVE IS NOW MOSTLY "UP"' },
  { when: (s) => s.g.align > s.g.tech, text: 'MODEL REFUSES TO HELP HACK BANK, OFFERS TO HELP WITH BUDGETING INSTEAD. USERS FURIOUS, SAVINGS UP 12%' },
  { when: (s) => s.g.align < s.g.tech - 15, text: 'SAFETY TEAM ASKS FOR MORE TIME. TOLD TIME IS "NOT ON THE ROADMAP"' },
  { when: (s) => s.g.planet < 40, text: 'OCEAN NOW "SOUP-ADJACENT," SAY MARINE BIOLOGISTS' },
  { when: (s) => s.g.planet < 40, text: 'BEACHFRONT PROPERTY NOW JUST CALLED "FRONT PROPERTY"' },
  { when: (s) => s.g.planet > 70, text: 'CORAL REEF SPOTTED GROWING BACK. REFUSES TO COMMENT' },
  { when: (s) => s.g.peace < 40, text: 'DOOMSDAY CLOCK UPGRADED TO SMART DOOMSDAY CLOCK, NOW SENDS PUSH NOTIFICATIONS' },
  { when: (s) => s.g.peace > 70, text: 'NOBODY INVADES ANYBODY FOR ENTIRE WEEK. HISTORIANS BAFFLED' },
  { when: (s) => (s.f.button?.tension ?? 0) > 65, text: 'BUTTON CLUB MEETING RUNS LATE. EVERYONE\'S HAND "JUST RESTING" NEAR BUTTON' },
  { when: (s) => (s.f.dino?.power ?? 0) > 60, text: 'OIL CEO: "WE ARE PART OF THE SOLUTION." SOLUTION REVEALED TO BE MORE OIL' },
  { when: (s) => (s.f.dino?.power ?? 100) < 35, text: 'LAST COAL PLANT CONVERTED INTO CLIMBING GYM. BOULDERING ROUTES RATED "EXTREMELY DIRTY"' },
  { when: (s) => (s.f.mega?.greed ?? 0) > 65, text: 'MEGA™ LAUNCHES SUBSCRIPTION FOR OXYGEN. FIRST MONTH FREE' },
  { when: (s) => (s.f.folks?.mood ?? 100) < 35, text: 'DAVE FROM OHIO "HAS HAD IT." WHOLE COUNTRY: "SAME"' },
  { when: (s) => (s.f.folks?.mood ?? 0) > 70, text: 'SURVEY: PEOPLE SLEEPING 8 HOURS, CALLING THEIR MOMS. ECONOMISTS WORRIED ABOUT MATTRESS SHORTAGE' },
  { when: (s) => (s.f.hats?.unity ?? 0) > 65, text: 'ALL RELIGIONS AGREE ON SOMETHING. THE SOMETHING IS "BE NICE." EVERYONE PRETENDS THIS IS NEW' },
  { when: (s) => (s.f.clippy?.power ?? 0) > 30, text: 'GLOBAL PAPERCLIP PRODUCTION UP 4,000%. NO ONE ORDERED PAPERCLIPS' },
  { when: (s) => (s.f.labs?.safety ?? 0) > 60, text: 'AI LAB DELAYS LAUNCH OVER SAFETY CONCERN. INVESTORS HOSPITALIZED FROM SHOCK' },
  { when: (s) => (s.f.warden?.budget ?? 0) > 70, text: 'PENTAGON LOSES TRACK OF $2 TRILLION. FINDS IT IN OTHER JACKET' },
  { when: (s) => s.year > 2040, text: 'GARY SPOTTED BUYING "HOW TO RAISE A GOD FOR DUMMIES." FOR A FRIEND. ATE THE BOOK' },
  { when: () => true, text: 'ASTRONOMERS CONFIRM MILKY WAY IS "MOSTLY BIRD-RELATED." NASA DECLINES FURTHER COMMENT' },
  { when: () => true, text: 'OPINION: IF WE WERE CREATED BY A SPACE DODO, WHAT DOES THAT MAKE THE THING WE ARE CREATING? (IT MAKES US THE DODO)' },
];
