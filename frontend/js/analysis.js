/* ============ AI-STYLE FLOOD RISK SCORING ENGINE (DEMO/SYNTHETIC) ============ */
/* NOTE: This is a lightweight heuristic prototype, not a trained ML model.
   Weights are illustrative and clearly labelled as DEMO logic. */

function computeRiskScore(zone, recentRainfallMm){
  recentRainfallMm = recentRainfallMm || 0;
  const elevationFactor = Math.max(0, (15 - zone.elevation) / 15);        // lower elevation -> higher risk
  const drainageFactor = Math.max(0, (zone.drainageBlockage) / 100);        // more blockage -> higher risk
  const imperviousFactor = zone.imperviousArea / 100;
  const historyFactor = Math.min(1, zone.historicalIncidents / 8);
  const rainFactor = Math.min(1, recentRainfallMm / 60);
  const waterFactor = Math.min(1, (zone.waterLevel || 0) / 2);

  const score =
    rainFactor * 32 +
    elevationFactor * 22 +
    drainageFactor * 20 +
    imperviousFactor * 10 +
    historyFactor * 8 +
    waterFactor * 8;

  return Math.round(Math.min(100, score));
}

function riskLevelFromScore(score){
  if(score >= 75) return 'Critical';
  if(score >= 55) return 'High';
  if(score >= 30) return 'Moderate';
  return 'Low';
}

function riskContributors(zone, recentRainfallMm){
  const factors = [];
  if((recentRainfallMm||0) > 25) factors.push('🌧 Heavy rainfall');
  if(zone.elevation < 6) factors.push('📍 Low elevation');
  if(zone.drainageBlockage > 40) factors.push('🚰 Drainage blockage');
  if(zone.historicalIncidents > 3) factors.push('🚧 History of waterlogging');
  if(zone.imperviousArea > 65) factors.push('🏙️ High impervious surface area');
  if(factors.length === 0) factors.push('✅ No major risk contributors detected');
  return factors;
}

function analyzeZone(zone, latestRainfallMm){
  const score = computeRiskScore(zone, latestRainfallMm);
  return {
    zoneId: zone.id,
    zoneName: zone.name,
    score,
    level: riskLevelFromScore(score),
    contributors: riskContributors(zone, latestRainfallMm)
  };
}

/* Precaution / early-warning simulator:
   simulates +35mm rainfall over next 6h and flags zones whose level would escalate. */
function simulatePrecautionSignals(zones, currentRainfallMm){
  const SIMULATED_BURST = 35;
  const signals = [];
  zones.forEach(zone=>{
    const currentScore = computeRiskScore(zone, currentRainfallMm);
    const currentLevel = riskLevelFromScore(currentScore);
    const futureScore = computeRiskScore(zone, currentRainfallMm + SIMULATED_BURST);
    const futureLevel = riskLevelFromScore(futureScore);
    if(futureLevel !== currentLevel){
      signals.push({
        zoneId: zone.id, zoneName: zone.name,
        currentLevel, futureLevel, currentScore, futureScore
      });
    }
  });
  return signals;
}

function averageRecentRainfall(rainfallSeries, hours){
  hours = hours || 3;
  const slice = rainfallSeries.slice(-hours);
  if(slice.length === 0) return 0;
  return slice.reduce((a,b)=>a+b.mm,0) / slice.length;
}
