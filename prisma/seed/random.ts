/** Small seeded PRNG (mulberry32) so demo data is identical on every machine. */
export function createRandom(seed = 20261002) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    chance: (p: number) => next() < p,
  };
}

export const MALE_NAMES = [
  "Muhammad", "Ahmed", "Ali", "Hassan", "Hussain", "Usman", "Bilal", "Hamza", "Umar", "Zain", "Abdullah", "Ibrahim",
  "Saad", "Faisal", "Imran", "Kamran", "Tariq", "Waqas", "Shahzaib", "Arsalan", "Danish", "Haris", "Rayyan", "Ayaan",
  "Fahad", "Junaid", "Talha", "Mustafa", "Yousuf", "Huzaifa", "Asad", "Moiz", "Noman", "Sami", "Zohaib",
] as const;

export const FEMALE_NAMES = [
  "Ayesha", "Fatima", "Zainab", "Maryam", "Hira", "Sana", "Sara", "Mahnoor", "Iqra", "Areeba", "Khadija", "Amna",
  "Hafsa", "Laiba", "Anaya", "Eman", "Noor", "Alishba", "Rimsha", "Mehwish", "Saima", "Nadia", "Rabia", "Zoya",
  "Javeria", "Hania", "Minahil", "Esha", "Aleena", "Dua",
] as const;

export const SURNAMES = [
  "Khan", "Ahmed", "Ali", "Malik", "Qureshi", "Raza", "Hussain", "Sheikh", "Butt", "Chaudhry", "Siddiqui", "Abbasi",
  "Javed", "Iqbal", "Mirza", "Bhatti", "Awan", "Rana", "Hashmi", "Gillani", "Shah", "Baig", "Zafar", "Aslam", "Anwar",
] as const;

export const ISB_AREAS = ["G-11/2", "F-10/4", "I-8/3", "G-9/1", "E-11/2", "F-8/1", "DHA Phase 2", "Bahria Town Phase 4", "PWD Housing", "G-13/1"] as const;
export const RWP_AREAS = ["Satellite Town", "Saddar", "Chaklala Scheme III", "Westridge", "Gulraiz", "Bahria Town Phase 7", "Askari 14", "Peshawar Road"] as const;

export function phoneNumber(r: ReturnType<typeof createRandom>) {
  const prefix = r.pick(["300", "301", "302", "303", "311", "312", "321", "322", "333", "334", "345", "346"]);
  return `+92 ${prefix} ${r.int(1000000, 9999999)}`;
}

export function cnicNumber(r: ReturnType<typeof createRandom>, female: boolean) {
  const last = female ? r.pick([2, 4, 6, 8]) : r.pick([1, 3, 5, 7, 9]);
  return `${r.pick(["61101", "37405", "35202", "17301"])}-${r.int(1000000, 9999999)}-${last}`;
}
