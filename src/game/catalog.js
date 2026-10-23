// Spillway: shop catalog, prices and toolbar slots.

export const ITEMS = {
  funnel: { name: 'Lejek', desc: 'Zbiera rozlaną wodę w wąski strumień.', price: 40 },
  pipe: { name: 'Rura', desc: 'Tunel: woda płynie w środku, inna może jechać po wierzchu.', price: 60 },
  tramp: { name: 'Trampolina', desc: 'Odbija wodę wysoko i daleko.', price: 50 },
  fan: { name: 'Wentylator', desc: 'Dmucha wodę w jedną stronę.', price: 80 },
  lift: { name: 'Winda', desc: 'Rura, która wciąga wodę w kierunku strzałek.', price: 120 },
};

export const POWERS = {
  ice: { name: 'Lód', desc: 'Zamraża całą wodę na 4 s. Czas na poprawki.', price: 70 },
  magnet: { name: 'Magnes', desc: 'Przez 5 s przyciąga wodę do wskazanego punktu.', price: 60 },
  refill: { name: 'Tusz+', desc: 'Dolewa połowę tuszu do twojego markera.', price: 40 },
};

export const UPGRADES = {
  ink: { name: 'Więcej tuszu', desc: '+25% tuszu dla całej drużyny.', base: 120 },
  tank: { name: 'Większy zbiornik', desc: '+20% wody na poziom, czyli więcej kasy.', base: 150 },
  pump: { name: 'Szybsza pompka', desc: '+30% przepływu z pompki.', base: 100 },
};

export const UP_MAX = 4;
export const upPrice = (k, lvl) => UPGRADES[k].base * 2 ** lvl;

export const SLOTS = [
  { k: 'marker', name: 'Marker', key: '1' },
  { k: 'eraser', name: 'Gumka', key: '2' },
  { k: 'funnel', name: 'Lejek', key: '3', item: true },
  { k: 'pipe', name: 'Rura', key: '4', item: true },
  { k: 'tramp', name: 'Trampolina', key: '5', item: true },
  { k: 'fan', name: 'Wentylator', key: '6', item: true },
  { k: 'lift', name: 'Winda', key: '7', item: true },
  { k: 'ice', name: 'Lód', key: '8', power: true },
  { k: 'magnet', name: 'Magnes', key: '9', power: true },
  { k: 'refill', name: 'Tusz+', key: '0', power: true },
];

export const START_MONEY = 100;
