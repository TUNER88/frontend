import { assert, describe, it } from "vitest";

import {
  emptySolarEnergyPreference,
  getReferencedStatisticIds,
  type EnergyInfo,
  type EnergyPreferences,
  type SolarSourceTypeEnergyPreference,
} from "../../src/data/energy";

const info = (cost_sensors: Record<string, string> = {}): EnergyInfo => ({
  cost_sensors,
  solar_forecast_domains: [],
});

const prefs = (source: SolarSourceTypeEnergyPreference): EnergyPreferences => ({
  energy_sources: [source],
  device_consumption: [],
  device_consumption_water: [],
});

describe("solar savings preferences", () => {
  it("starts with no savings tracking", () => {
    const source = emptySolarEnergyPreference();
    assert.equal(source.stat_cost, null);
    assert.equal(source.entity_energy_price, null);
    assert.equal(source.number_energy_price, null);
  });

  it("references a total-savings statistic and the generated savings sensor", () => {
    const ids = getReferencedStatisticIds(
      prefs({
        ...emptySolarEnergyPreference(),
        stat_energy_from: "sensor.solar_production",
        stat_cost: "sensor.solar_savings_total",
      }),
      info({
        "sensor.solar_production": "sensor.solar_production_savings",
      })
    );
    assert.deepEqual(ids, [
      "sensor.solar_production",
      "sensor.solar_savings_total",
      "sensor.solar_production_savings",
    ]);
  });

  it("does not invent a savings statistic when tracking is off", () => {
    const ids = getReferencedStatisticIds(
      prefs({
        ...emptySolarEnergyPreference(),
        stat_energy_from: "sensor.solar_production",
      }),
      info({})
    );
    assert.deepEqual(ids, ["sensor.solar_production"]);
  });
});
