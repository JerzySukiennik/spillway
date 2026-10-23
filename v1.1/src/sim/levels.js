// Spillway: hand-made levels. World is 1000 units tall; x grows to the right. Tanks pour from the top-left, cups wait on the right.

const ledge = (x0, x1, y) => [x0 - 20, y + 6, x1 + 20, y + 6, x1 + 52, y + 70, x1 + 10, 1012, x0 - 10, 1012, x0 - 52, y + 70];

export const LEVELS = [
  {
    name: 'Pierwszy spływ', w: 2300, ink: 1900, water: 260,
    tanks: [300, 660, 150], shelf: [1760, 2120, 820],
    rocks: [ledge(1700, 2180, 820)],
    hint: 'Narysuj rynnę od swojego zbiornika do kubka w twoim kolorze. Potem trzymaj Spację.',
  },
  {
    name: 'Głaz', w: 2700, ink: 2300, water: 260,
    tanks: [260, 620, 150], shelf: [2140, 2500, 820],
    rocks: [
      [900, 1012, 880, 720, 940, 580, 1060, 500, 1260, 465, 1440, 505, 1560, 620, 1600, 780, 1580, 1012],
      ledge(2080, 2560, 820),
    ],
    hint: 'Głaz zagradza drogę. Przeprowadź wodę górą albo wykorzystaj jego zbocze.',
  },
  {
    name: 'Strefa zakazu', w: 2900, ink: 2400, water: 270,
    tanks: [260, 620, 150], shelf: [2300, 2660, 820],
    nodraw: [[880, 460, 820, 552]],
    rocks: [ledge(2240, 2720, 820), [700, 1012, 720, 840, 800, 800, 860, 860, 870, 1012]],
    hint: 'W kreskowanym polu nie da się rysować ani nic stawiać. Woda może przez nie przelecieć.',
  },
  {
    name: 'Mikser', w: 3100, ink: 2600, water: 280,
    tanks: [260, 620, 150], shelf: [2340, 2700, 820],
    mixer: [1300, 520], rainbowCup: [1900, 880],
    rocks: [ledge(2280, 2760, 820), ledge(1840, 1960, 880)],
    hint: 'Mikser zlewa wodę wszystkich graczy w tęczę. Tęcza w tęczowym kubku liczy się podwójnie.',
  },
  {
    name: 'Na krzyż', w: 3000, ink: 2600, water: 280, order: [3, 2, 1, 0],
    tanks: [260, 620, 150], shelf: [2280, 2640, 820],
    rocks: [ledge(2220, 2700, 820), [1300, 1012, 1320, 900, 1400, 860, 1480, 900, 1500, 1012]],
    hint: 'Kubki stoją w odwrotnej kolejności. Dogadajcie się, kto leje pierwszy, albo przeskoczcie nad sobą.',
  },
  {
    name: 'Wiatr', w: 3300, ink: 2700, water: 290,
    tanks: [260, 620, 150], shelf: [2520, 2880, 820],
    fixed: [{ k: 'fan', x: 1880, y: 560, a: 12, f: 0.17 }, { k: 'fan', x: 1880, y: 720, a: 12, f: 0.17 }, { k: 'fan', x: 1880, y: 880, a: 12, f: 0.17 }],
    rocks: [ledge(2460, 2940, 820), [1896, 1012, 1896, 500, 1918, 482, 1940, 500, 1940, 1012]],
    hint: 'Wentylatory dmuchają w lewo. Trzymaj wodę nad nimi.',
  },
  {
    name: 'Mur', w: 3400, ink: 2900, water: 300,
    tanks: [260, 620, 150], shelf: [2700, 3060, 830],
    rocks: [
      [1700, 1012, 1690, 530, 1730, 475, 1800, 470, 1845, 525, 1835, 1012],
      ledge(2640, 3120, 830),
    ],
    hint: 'Mur jest wysoki. Nie trać spadku za wcześnie.',
  },
  {
    name: 'Dolina', w: 3600, ink: 3000, water: 300,
    tanks: [260, 620, 150], shelf: [2960, 3320, 820],
    mixer: [1750, 640], rainbowCup: [2420, 900],
    nodraw: [[1050, 560, 380, 452]],
    rocks: [
      [1470, 1012, 1480, 780, 1560, 730, 1620, 760, 1640, 1012],
      [1860, 1012, 1880, 760, 1940, 730, 2020, 780, 2030, 1012],
      ledge(2380, 2460, 900), ledge(2900, 3380, 820),
    ],
    hint: 'Mikser stoi nisko w dolinie, a tęczowy kubek jeszcze niżej za skałą.',
  },
  {
    name: 'Przepaść', w: 3900, ink: 3200, water: 310,
    tanks: [260, 620, 150], shelf: [3260, 3620, 900],
    nodraw: [[860, 430, 560, 582], [1880, -100, 560, 640]],
    rocks: [ledge(3200, 3680, 900), [1500, 1012, 1520, 700, 1600, 660, 1700, 700, 1720, 1012]],
    hint: 'Pierwszą strefę przejdźcie górą, przez drugą woda musi spaść i dać się złapać pod spodem.',
  },
  {
    name: 'Finał', w: 4400, ink: 3500, water: 320, order: [1, 3, 0, 2],
    tanks: [260, 620, 150], shelf: [3740, 4100, 820],
    mixer: [2300, 560], rainbowCup: [3300, 880],
    nodraw: [[900, 460, 460, 552]],
    fixed: [{ k: 'fan', x: 1900, y: 720, a: 12, f: 0.16 }, { k: 'fan', x: 1900, y: 880, a: 12, f: 0.16 }],
    rocks: [
      [1450, 1012, 1440, 560, 1500, 470, 1580, 460, 1640, 540, 1630, 1012],
      ledge(3250, 3350, 880), ledge(3680, 4160, 820),
    ],
    hint: 'Wszystko naraz: skała, wiatr, strefa zakazu, mikser i pomieszane kubki.',
  },
];
