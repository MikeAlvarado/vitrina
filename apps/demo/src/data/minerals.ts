/*
 * The demo's dataset — 24 mineral and gem specimens from the Smithsonian
 * National Museum of Natural History, Mineral Sciences.
 *
 * Every field here is transcribed from the museum record, not written for the
 * demo: species, locality, catalogue number, cut, weight, associated minerals.
 * That is the point of using a real collection — a detail panel filled with
 * two dozen invented paragraphs proves nothing about the panel.
 *
 * Rights: each record was checked individually on its own si.edu page for an
 * open-access image, not assumed from the collection. See assets/CREDITS.md.
 *
 * Generated once and committed; there is no build-time fetch.
 */

/** Demo-side shape. The library never looks inside `entity.data`. */
export interface Specimen {
  id: string;
  /** The record's title, variety included: "Beryl (var. aquamarine)". */
  name: string;
  locality: string;
  /** USNM catalogue number. */
  catalogue: string;
  collection: 'Gems' | 'Minerals';
  /** The named mine or site, when the record has one and the locality does not say it. */
  site?: string;
  cut?: string;
  weight?: string;
  color?: string;
  /** "Selenian", "Cuprian" — the record's chemical modifier. */
  modifier?: string;
  associated?: string[];
  /** EDAN record id; the si.edu page is `${RECORD_BASE}${recordId}`. */
  recordId: string;
  /** Reference diameter in px at zoom 1 — cut gems are small, groups are not. */
  size: number;
}

export const RECORD_BASE = 'https://www.si.edu/object/';

export const SPECIMENS: Specimen[] = [
  {
    id: 'aquamarine-connecticut',
    name: 'Beryl (var. aquamarine)',
    locality: 'Connecticut, United States',
    catalogue: 'NMNH G779-00',
    collection: 'Gems',
    cut: 'Modified Cushion',
    weight: '14.3 ct',
    color: 'Medium Slightly Gray Blue Green',
    recordId: 'nmnhmineralsciences_1004981',
    size: 150,
  },
  {
    id: 'spessartine',
    name: 'Spessartine',
    locality: 'Amelia, Amelia Co., Virginia, United States',
    catalogue: 'NMNH G152-00',
    collection: 'Gems',
    cut: 'Round Brilliant',
    weight: '11.802 ct',
    color: 'Medium Dark Orange',
    recordId: 'nmnhmineralsciences_1007495',
    size: 150,
  },
  {
    id: 'afghanite',
    name: 'Afghanite',
    locality: 'Sar-E-Sang District, Badakhshan Province, Afghanistan',
    catalogue: 'NMNH G10675-00',
    collection: 'Gems',
    cut: 'Oval',
    weight: '0.6 ct',
    color: 'Blue',
    recordId: 'nmnhmineralsciences_10209863',
    size: 150,
  },
  {
    id: 'fluorite-vietnam',
    name: 'Fluorite',
    locality: 'Cao Bang Province, Vietnam',
    catalogue: 'NMNH G10658-00',
    collection: 'Gems',
    cut: 'Rectangular Cushion',
    weight: '55.24 ct',
    color: 'Green',
    recordId: 'nmnhmineralsciences_10209869',
    size: 150,
  },
  {
    id: 'spinel',
    name: 'Spinel',
    locality: 'Tanzania',
    catalogue: 'NMNH G10558-00',
    collection: 'Gems',
    weight: '5.78 ct',
    color: 'Pink',
    recordId: 'nmnhmineralsciences_10209994',
    size: 150,
  },
  {
    id: 'vivianite',
    name: 'Vivianite',
    locality: 'Beverly Mill, Virginia, United States',
    catalogue: 'NMNH 119189-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1056759',
    size: 205,
  },
  {
    id: 'sulfur-sicily',
    name: 'Sulfur',
    locality: 'Sicily, Italy',
    catalogue: 'NMNH 138633-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1076081',
    size: 205,
  },
  {
    id: 'diamond',
    name: 'Diamond',
    locality: 'Palabora B, South Africa',
    catalogue: 'NMNH 140600-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1078091',
    size: 205,
  },
  {
    id: 'emerald',
    name: 'Beryl (var. emerald)',
    locality: 'Colombia',
    catalogue: 'NMNH 142510-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1079782',
    size: 205,
  },
  {
    id: 'azurite',
    name: 'Azurite',
    locality: 'Bisbee, Cochise Co., Arizona, United States',
    catalogue: 'NMNH 144456-00',
    collection: 'Minerals',
    associated: ['Goethite', 'Malachite'],
    recordId: 'nmnhmineralsciences_1081797',
    size: 205,
  },
  {
    id: 'galena',
    name: 'Galena',
    locality: 'County Tipperary, Munster, Ireland',
    catalogue: 'NMNH 147195-00',
    collection: 'Minerals',
    site: 'Mogul Mine',
    associated: ['Sphalerite'],
    recordId: 'nmnhmineralsciences_1084595',
    size: 205,
  },
  {
    id: 'sphalerite',
    name: 'Sphalerite',
    locality: 'Santander, Spain',
    catalogue: 'NMNH 148306-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1085716',
    size: 205,
  },
  {
    id: 'aquamarine-nagar',
    name: 'Beryl (var. aquamarine)',
    locality: 'Nagar, Pakistan',
    catalogue: 'NMNH 168412-00',
    collection: 'Minerals',
    associated: ['Muscovite'],
    recordId: 'nmnhmineralsciences_1105408',
    size: 205,
  },
  {
    id: 'fluorite-westmoreland',
    name: 'Fluorite',
    locality: 'Westmoreland, Cheshire Co., New Hampshire, United States',
    catalogue: 'NMNH 171349-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1108019',
    size: 205,
  },
  {
    id: 'lazurite',
    name: 'Lazurite',
    locality: 'Afghanistan',
    catalogue: 'NMNH 171593-00',
    collection: 'Minerals',
    associated: ['Calcite', 'Nepheline', 'Pyrite'],
    recordId: 'nmnhmineralsciences_1108266',
    size: 205,
  },
  {
    id: 'aurichalcite',
    name: 'Aurichalcite',
    locality: 'Tintic District, Juab Co., Utah, United States',
    catalogue: 'NMNH 87824-01',
    collection: 'Minerals',
    associated: ['Hemimorphite'],
    recordId: 'nmnhmineralsciences_1119075',
    size: 205,
  },
  {
    id: 'malachite',
    name: 'Malachite',
    locality: 'Otjikoto, Namibia',
    catalogue: 'NMNH B14193-00',
    collection: 'Minerals',
    site: 'Tsumeb',
    associated: ['Azurite', 'Cuprite', 'Quartz'],
    recordId: 'nmnhmineralsciences_1130454',
    size: 205,
  },
  {
    id: 'quartz-bagdad',
    name: 'Quartz',
    locality: 'Bagdad, Arizona, United States',
    catalogue: 'NMNH C6373-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1155264',
    size: 205,
  },
  {
    id: 'sulfur-agrigento',
    name: 'Sulfur',
    locality: 'Agrigento, Ralcalmuto, Sicily, Italy',
    catalogue: 'NMNH R12231-00',
    collection: 'Minerals',
    modifier: 'Selenian',
    recordId: 'nmnhmineralsciences_1159517',
    size: 205,
  },
  {
    id: 'corundum',
    name: 'Corundum',
    locality: 'Azad Kashmir, Pakistan',
    catalogue: 'NMNH 176171-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_11659967',
    size: 205,
  },
  {
    id: 'agate',
    name: 'Quartz (var. agate)',
    locality: 'Dryhead, Montana, United States',
    catalogue: 'NMNH R18965-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1166741',
    size: 205,
  },
  {
    id: 'smithsonite',
    name: 'Smithsonite',
    locality: 'Otjikoto, Namibia',
    catalogue: 'NMNH R8520-01',
    collection: 'Minerals',
    site: 'Tsumeb',
    modifier: 'Cuprian',
    recordId: 'nmnhmineralsciences_1177142',
    size: 205,
  },
  {
    id: 'copper',
    name: 'Copper',
    locality: 'Ajo, Pima Co., Arizona, United States',
    catalogue: 'NMNH 125401-00',
    collection: 'Minerals',
    recordId: 'nmnhmineralsciences_1180452',
    size: 205,
  },
  {
    id: 'dravite',
    name: 'Dravite',
    locality: 'Tanzania',
    catalogue: 'NMNH G10203-00',
    collection: 'Gems',
    cut: 'Round',
    weight: '1.57 ct',
    color: 'Yellow Orange',
    recordId: 'nmnhmineralsciences_1350621',
    size: 150,
  },
];

/*
 * The cut-outs, hashed by Vite and resolved by id. A glob rather than 24
 * imports: adding a specimen is then a row above and a file beside it.
 */
const FILES = import.meta.glob('../../assets/objects/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

const byId = new Map(
  Object.entries(FILES).map(([path, url]) => [path.split('/').pop()!.replace('.webp', ''), url]),
);

export const specimenImage = (id: string): string => {
  const url = byId.get(id);
  if (!url) throw new Error(`No cut-out for specimen "${id}"`);
  return url;
};
