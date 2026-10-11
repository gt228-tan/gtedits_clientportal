/**
 * GT Edits Official Agency Rate Card
 * 
 * Rates are in INR (₹).
 * Subtitles and captions are ALWAYS INCLUDED for FREE (₹0 extra).
 * You can adjust these base rates anytime to match your exact pricing.
 */

const RATE_CARD = {
  currency: 'INR',
  currencySymbol: '₹',

  baseRates: {
    'Reel': 800,
    'Reels': 800,
    'Shorts': 800,
    'Instagram Reel': 800,

    // Gaming content
    'Gaming Highlights': 1500,
    'Gaming Montage': 1500,
    'Gaming Clip': 1000,

    // Long-form video editing
    'Video': 2000,
    'Long-form Video': 2000,
    'YouTube Video': 2000,
    'Vlog / Podcast Cut': 2200,

    // Graphics & Design
    'Thumbnail': 600,
    'Poster': 500,
    'Banner': 600,

    'Social Media Package': 2500,
    'Other': 1000,
  },

  // Add-ons & Modifiers
  addons: {
    subtitles: {
      name: 'Subtitles / Captions',
      cost: 0, // ALWAYS FREE / INCLUDED per user request
      isFree: true,
      description: 'Dynamic animated subtitles included at no extra charge',
    },
    colorGrading: {
      name: 'Color Grading & Sound Design',
      cost: 0,
      isFree: true,
      description: 'Standard audio mixing and color grade included',
    },
    expressTurnaround: {
      name: 'Express 48-Hour Delivery',
      multiplier: 1.25, // +25% only if urgent deadline requested (< 2 days)
      description: 'Priority queue rush delivery fee',
    },
  },

  // Helper function to resolve rate for a given type
  getRateForType(type = '') {
    const cleanType = String(type).trim().toLowerCase();
    for (const [key, rate] of Object.entries(this.baseRates)) {
      if (key.toLowerCase() === cleanType || cleanType.includes(key.toLowerCase())) {
        return rate;
      }
    }
    return this.baseRates['Other'];
  },
};

module.exports = RATE_CARD;
