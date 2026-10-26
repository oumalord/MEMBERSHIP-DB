export const MEMBERSHIP_CATEGORIES = [
  { name: 'Rainbows', min: 3, max: 6 },
  { name: 'Brownies', min: 7, max: 9 },
  { name: 'Girl Guides', min: 10, max: 14 },
  { name: 'Ranger', min: 15, max: 17 },
  { name: 'Young Leader', min: 18, max: 35 },
  { name: 'Bravo', min: 36, max: 60 },
  { name: 'Trefoil', min: 61, max: 120 },
] as const;

export const MEMBERSHIP_CATEGORY_NAMES = MEMBERSHIP_CATEGORIES.map(({ name }) => name);

export function membershipCategoryForAge(age: number): string {
  return MEMBERSHIP_CATEGORIES.find(({ min, max }) => age >= min && age <= max)?.name || 'Unassigned';
}