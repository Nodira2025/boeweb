/**
 * Clean and normalize text for comparison
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD') // Split accents from letters
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[^a-z0-9\s]/g, ' ') // Replace punctuation with space
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

/**
 * Extract numbers from string to ensure size/volume matches
 */
function extractNumbers(text) {
  const normalized = normalizeText(text);
  const matches = normalized.match(/\b\d+\b/g) || [];
  return matches;
}

/**
 * Calculate Jaro-Winkler similarity between two strings
 */
function jaroWinkler(s1, s2) {
  let m = 0;

  // Exit early if either are empty
  if (s1.length === 0 || s2.length === 0) return 0;

  // Convert to lower case
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();

  // Exit early if they're an exact match
  if (s1 === s2) return 1;

  // Range for matching
  const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;

  const s1Matches = new Array(s1.length).fill(false);
  const s2Matches = new Array(s2.length).fill(false);

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchWindow);
    const end = Math.min(s2.length - 1, i + matchWindow);

    for (let j = start; j <= end; j++) {
      if (s2Matches[j]) continue;
      if (s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      m++;
      break;
    }
  }

  // No matches
  if (m === 0) return 0;

  // Transpositions
  let k = 0;
  let t = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) t++;
    k++;
  }
  t = t / 2;

  // Jaro Similarity
  const jaroSim = (m / s1.length + m / s2.length + (m - t) / m) / 3;

  // Winkler Modification
  let p = 0.1; // scaling factor
  let l = 0; // length of common prefix (max 4)
  while (s1[l] === s2[l] && l < 4) l++;

  return jaroSim + l * p * (1 - jaroSim);
}

/**
 * Check if two product names match based on fuzzy text and matching numbers
 */
function findBestMatch(supplierName, baseProducts, threshold = 0.74) {
  const normSupplier = normalizeText(supplierName);
  const supplierNums = extractNumbers(supplierName);
  
  let bestMatch = null;
  let highestScore = 0;

  for (const product of baseProducts) {
    const normBase = normalizeText(product.name);
    
    // Rule 1: Numeric constraint. 
    // If numbers in product names do not match, we discard it to prevent mismatching 20L vs 80L, 5x vs 10x etc.
    const baseNums = extractNumbers(product.name);
    
    // Compare number arrays
    if (supplierNums.length > 0 || baseNums.length > 0) {
      // If one has numbers and the other doesn't, or they don't share the same numbers, skip
      const numIntersection = supplierNums.filter(n => baseNums.includes(n));
      const hasMismatch = supplierNums.some(n => !baseNums.includes(n)) || baseNums.some(n => !supplierNums.includes(n));
      if (hasMismatch && numIntersection.length === 0) {
        continue;
      }
    }

    // Rule 2: String Similarity
    const score = jaroWinkler(normSupplier, normBase);
    
    // Rule 3: Token overlapping (bonus)
    const supplierTokens = normSupplier.split(' ');
    const baseTokens = normBase.split(' ');
    const overlap = supplierTokens.filter(t => baseTokens.includes(t)).length;
    const tokenScore = overlap / Math.max(supplierTokens.length, baseTokens.length);

    // Combine scores (70% JW, 30% Token overlap)
    const finalScore = score * 0.7 + tokenScore * 0.3;

    if (finalScore > highestScore) {
      highestScore = finalScore;
      bestMatch = { product, score: finalScore };
    }
  }

  if (bestMatch && highestScore >= threshold) {
    return bestMatch;
  }

  return null;
}

module.exports = {
  normalizeText,
  extractNumbers,
  jaroWinkler,
  findBestMatch
};
