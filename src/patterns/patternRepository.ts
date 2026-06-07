import { AxonPattern } from '../types/index.js';

export class PatternRepository {
  private patterns: Map<string, AxonPattern> = new Map();

  constructor() {
    this.initializePatterns();
  }

  private initializePatterns() {
    // Energy Patterns
    this.addPattern({
      id: 'energy-consumption-total',
      name: 'Total Energy Consumption',
      description: 'Calculate total energy consumption for a site or meter over a date range',
      code: `(meter, dates) => do
  meter.hisRead(dates).foldCol("v0", sum)
end`,
      useCases: [
        'Monthly energy reporting',
        'Billing verification',
        'Energy baseline calculation'
      ],
      relatedFunctions: ['meterOccUsage', 'his_totalEnergy']
    });

    this.addPattern({
      id: 'energy-cost-calculation',
      name: 'Energy Cost Calculation',
      description: 'Convert energy consumption (kWh) to cost using rate structures',
      code: `(kwh, rate: 0.12$, peakRate: 0.18$, isPeak: false) => do
  effectiveRate: isPeak ? peakRate : rate
  kwh * effectiveRate
end`,
      useCases: [
        'Utility bill estimation',
        'Cost allocation',
        'Budget tracking'
      ],
      relatedFunctions: ['his_elecKwhToCost', 'his_costPerkWh']
    });

    // HVAC Control Patterns
    this.addPattern({
      id: 'hvac-setpoint-reset',
      name: 'Temperature Setpoint Reset',
      description: 'Reset temperature setpoint based on outdoor air temperature',
      code: `(oat, baseSetpoint: 72°F, resetRatio: 0.5) => do
  // Reset setpoint when OAT is between 55°F and 75°F
  if (oat < 55°F) baseSetpoint
  else if (oat > 75°F) baseSetpoint + 4°F
  else baseSetpoint + ((oat - 55°F) / 20°F) * 4°F * resetRatio
end`,
      useCases: [
        'Supply air temperature reset',
        'Chilled water temperature reset',
        'Energy optimization'
      ],
      relatedFunctions: ['computedSetpt', 'setpointSelect']
    });

    this.addPattern({
      id: 'hvac-simultaneous-heat-cool',
      name: 'Simultaneous Heating and Cooling Detection',
      description: 'Detect when equipment is simultaneously heating and cooling',
      code: `(ahu, dates) => do
  heatValve: read(hot and water and valve and cmd and equipRef == ahu->id)
  coolValve: read(chilled and water and valve and cmd and equipRef == ahu->id)
  
  history: readAll([heatValve, coolValve]).hisRead(dates)
  
  faults: history.findAll(row => row->v0 > 10% and row->v1 > 10%)
  if (faults.size > 0) {
    count: faults.size,
    duration: faults.foldCol("dur", sum),
    periods: faults
  }
  else null
end`,
      useCases: [
        'Energy waste detection',
        'Control sequence verification',
        'Commissioning issues'
      ],
      relatedFunctions: ['spk_ahuCoolAndHeat']
    });

    // Meter Analysis Patterns
    this.addPattern({
      id: 'meter-zero-reading-detection',
      name: 'Zero Reading Detection',
      description: 'Identify periods when meters report zero or no data',
      code: `(meter, dates, threshold: 0.1kW) => do
  his: meter.hisRead(dates)
  zeros: his.findAll(row => row->v0 < threshold)
  
  if (zeros.size > 0) {
    periods: hisFindPeriods(zeros, v => v->v0 < threshold)
    {
      count: periods.size,
      totalDuration: periods.foldCol("dur", sum),
      longestPeriod: periods.foldCol("dur", max),
      periods: periods
    }
  }
  else null
end`,
      useCases: [
        'Meter health monitoring',
        'Data quality verification',
        'Communication fault detection'
      ],
      relatedFunctions: ['meterZeroRead', 'meterNullData']
    });

    this.addPattern({
      id: 'meter-peak-demand',
      name: 'Peak Demand Analysis',
      description: 'Calculate peak demand over different intervals',
      code: `(meter, dates, interval: 15min) => do
  demand: meter.hisRead(dates).hisRollup(max, interval)
  
  {
    peakDemand: demand.foldCol("v0", max),
    peakTime: demand.find(row => row->v0 == demand.foldCol("v0", max))->ts,
    avgDemand: demand.foldCol("v0", avg),
    demandProfile: demand
  }
end`,
      useCases: [
        'Demand charge analysis',
        'Load profile characterization',
        'Peak shaving opportunities'
      ],
      relatedFunctions: ['kpi_KwNorm']
    });

    // Fault Detection Patterns
    this.addPattern({
      id: 'sensor-fault-detection',
      name: 'Sensor Fault Detection',
      description: 'Detect faulty sensors based on static values or out-of-range readings',
      code: `(sensor, dates, minExpected, maxExpected) => do
  his: sensor.hisRead(dates)
  
  // Check for static values
  uniqueVals: his.foldCol("v0", v => v.unique.size)
  isStatic: uniqueVals <= 1
  
  // Check for out of range
  outOfRange: his.findAll(row => 
    row->v0 < minExpected or row->v0 > maxExpected
  )
  
  {
    isStatic: isStatic,
    staticValue: isStatic ? his.first->v0 : null,
    outOfRangeCount: outOfRange.size,
    outOfRangePct: (outOfRange.size / his.size * 100).round(1)
  }
end`,
      useCases: [
        'Sensor calibration detection',
        'Maintenance scheduling',
        'Data validation'
      ],
      relatedFunctions: ['spk_sensorFailure']
    });

    // Scheduling Patterns
    this.addPattern({
      id: 'occupancy-schedule-check',
      name: 'Occupancy Schedule Verification',
      description: 'Verify equipment operation matches occupancy schedule',
      code: `(equip, dates) => do
  schedule: equip->schedule
  status: read(run and sensor and equipRef == equip->id)
  
  statusHis: status.hisRead(dates)
  
  // Check each hour
  violations: []
  statusHis.hisRollup(avg, 1hr).each(row => do
    hour: row->ts.hour
    dayOfWeek: row->ts.weekday
    
    shouldBeOn: schedule.isOccupied(row->ts)
    isOn: row->v0 > 0.5
    
    if (shouldBeOn != isOn) 
      violations = violations.add({
        ts: row->ts,
        shouldBeOn: shouldBeOn,
        actuallyOn: isOn
      })
  end)
  
  violations.toGrid
end`,
      useCases: [
        'Schedule optimization',
        'Override detection',
        'Energy waste identification'
      ],
      relatedFunctions: ['dayScheduleSelect', 'scheduleOperation']
    });

    // Data Aggregation Patterns
    this.addPattern({
      id: 'monthly-rollup-comparison',
      name: 'Monthly Rollup with Year-over-Year Comparison',
      description: 'Compare monthly data across multiple years',
      code: `(point, currentYear) => do
  previousYear: currentYear - 1year
  
  current: point.hisRead(currentYear)
    .hisRollup(sum, 1mo)
    .map(row => {month: row->ts.month, current: row->v0})
    
  previous: point.hisRead(previousYear)
    .hisRollup(sum, 1mo)
    .map(row => {month: row->ts.month, previous: row->v0})
    
  // Join and calculate difference
  joined: current.join(previous, "month")
  joined.map(row => 
    row.set("difference", row->current - row->previous)
       .set("percentChange", ((row->current - row->previous) / row->previous * 100).round(1))
  )
end`,
      useCases: [
        'Energy savings verification',
        'Trend analysis',
        'Performance tracking'
      ],
      relatedFunctions: ['dg_energyUseComparison']
    });
  }

  private addPattern(pattern: AxonPattern) {
    this.patterns.set(pattern.id, pattern);
  }

  getPattern(id: string): AxonPattern | undefined {
    return this.patterns.get(id);
  }

  getAllPatterns(): AxonPattern[] {
    return Array.from(this.patterns.values());
  }

  searchPatterns(keyword: string): AxonPattern[] {
    const lowercaseKeyword = keyword.toLowerCase();
    return this.getAllPatterns().filter(pattern => {
      const searchText = [
        pattern.name,
        pattern.description,
        pattern.code,
        pattern.useCases.join(' '),
        pattern.relatedFunctions.join(' ')
      ].join(' ').toLowerCase();
      
      return searchText.includes(lowercaseKeyword);
    });
  }

  getPatternsByCategory(category: string): AxonPattern[] {
    // Filter patterns by category based on their ID prefix
    const categoryPrefix = category.toLowerCase();
    return this.getAllPatterns().filter(pattern => 
      pattern.id.startsWith(categoryPrefix)
    );
  }
}