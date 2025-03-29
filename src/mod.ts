import { DependencyContainer } from "tsyringe";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPostDbLoadMod } from "@spt/models/external/IPostDbLoadMod";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { Skills } from "@spt/models/eft/common/tables/IBotBase";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { PlayerScavGenerator } from "@spt/generators/PlayerScavGenerator";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import config from "../config/config.json";

class ConfigurableStepsVolume implements IPreSptLoadMod, IPostDbLoadMod {
  modName: string = "ConfigurableStepsVolume";
  private container: DependencyContainer | null = null;
  private profileHelper: ProfileHelper | null = null;
  value: number;

  constructor() {
    this.value = this.calculateValue();
  }

  private calculateValue(): number {
    try {
      if (!config || typeof config.SilenceStepsByPercentage !== "number") {
        console.warn(`[${this.modName}] SilenceStepsByPercentage is missing or not a number in config.json. Defaulting to 45.`);
        return (5100 / 100) * 45; // Default to 45% = 2295
      }

      let percentage = config.SilenceStepsByPercentage;

      // Enforce range 0-100
      if (percentage < 0 || percentage > 100) {
        console.warn(`[${this.modName}] SilenceStepsByPercentage (${percentage}) is out of range (0-100). Clamping to nearest valid value.`);
        percentage = Math.max(0, Math.min(100, percentage)); // Clamp to 0-100
      } else {
        // Log successful application when within range without clamping
        console.info(`[${this.modName}] SilenceStepsByPercentage successfully set to ${percentage} (value: ${(5100 / 100) * percentage}).`);
      }

      const calculated = (5100 / 100) * percentage;
      return isNaN(calculated) ? (5100 / 100) * 45 : calculated; // Failsafe for NaN defaults to 45%
    } catch (error) {
      console.error(`[${this.modName}] Error calculating value: ${error.message}. Defaulting to 45 (2295).`);
      return (5100 / 100) * 45; // Default to 45% = 2295 on error
    }
  }

  private setBotSound(skills: Skills | undefined): Skills | undefined {
    if (!skills || !skills.Common || !Array.isArray(skills.Common)) {
      console.warn(`[${this.modName}] Invalid or missing skills data. Skipping BotSound update.`);
      return skills;
    }

    const BotSoundSkill = skills.Common.find((o) => o?.Id === "BotSound");
    if (!BotSoundSkill) {
      console.warn(`[${this.modName}] BotSound skill not found in skills.Common.`);
    } else {
      BotSoundSkill.Progress = this.value;
    }
    return skills;
  }

  private patchGeneratePlayerScav(): void {
    if (!this.container) {
      console.error(`[${this.modName}] Container not initialized. Cannot patch PlayerScavGenerator.`);
      return;
    }

    let oldClass: PlayerScavGenerator;
    try {
      oldClass = this.container.resolve<PlayerScavGenerator>("PlayerScavGenerator");
      if (!oldClass || typeof oldClass.getScavSkills !== "function") {
        throw new Error("PlayerScavGenerator or getScavSkills not found.");
      }
    } catch (error) {
      console.error(`[${this.modName}] Failed to resolve PlayerScavGenerator: ${error.message}`);
      return;
    }

    try {
      this.container.afterResolution(
        "PlayerScavGenerator",
        (_t, result: PlayerScavGenerator) => {
          const originalGetScavSkills = oldClass.getScavSkills.bind(oldClass);
          result.getScavSkills = (scavProfile: IPmcData): Skills => {
            if (!scavProfile) {
              console.warn(`[${this.modName}] Invalid scavProfile passed to getScavSkills.`);
              return originalGetScavSkills({} as IPmcData);
            }
            const skills = originalGetScavSkills(scavProfile);
            return this.setBotSound(skills) ?? skills;
          };
        },
        { frequency: "Always" }
      );
    } catch (error) {
      console.error(`[${this.modName}] Failed to patch PlayerScavGenerator: ${error.message}`);
    }
  }

  preSptLoad(container: DependencyContainer): void {
    if (!container) {
      console.error(`[${this.modName}] preSptLoad received null container. Aborting.`);
      return;
    }

    if (!config?.Enabled) {
      console.log(`[${this.modName}] Disabled in config. Skipping initialization.`);
      return;
    }

    this.container = container;

    try {
      this.profileHelper = this.container.resolve<ProfileHelper>("ProfileHelper");
      if (!this.profileHelper || typeof this.profileHelper.getProfiles !== "function") {
        throw new Error("ProfileHelper or getProfiles not available.");
      }
    } catch (error) {
      console.error(`[${this.modName}] Failed to resolve ProfileHelper: ${error.message}`);
      return;
    }

    this.patchGeneratePlayerScav();

    try {
      const profiles = this.profileHelper.getProfiles();
      if (!profiles || typeof profiles !== "object") {
        console.warn(`[${this.modName}] No valid profiles found. Skipping profile updates.`);
        return;
      }

      Object.keys(profiles).forEach((key) => {
        const profile = profiles[key];
        if (profile?.characters?.pmc?.Skills) {
          this.setBotSound(profile.characters.pmc.Skills);
        } else {
          console.warn(`[${this.modName}] Profile ${key} has invalid PMC skills data.`);
        }
      });
    } catch (error) {
      console.error(`[${this.modName}] Error updating existing profiles: ${error.message}`);
    }
  }

  postDbLoad(container: DependencyContainer): void {
    if (!container) {
      console.error(`[${this.modName}] postDbLoad received null container. Aborting.`);
      return;
    }

    if (!config?.Enabled) {
      console.log(`[${this.modName}] Disabled in config. Skipping postDbLoad.`);
      return;
    }

    let databaseServer: DatabaseServer;
    try {
      databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
      if (!databaseServer || typeof databaseServer.getTables !== "function") {
        throw new Error("DatabaseServer or getTables not available.");
      }
    } catch (error) {
      console.error(`[${this.modName}] Failed to resolve DatabaseServer: ${error.message}`);
      return;
    }

    try {
      const defaultProfiles = databaseServer.getTables().templates?.profiles;
      if (!defaultProfiles || typeof defaultProfiles !== "object") {
        console.warn(`[${this.modName}] No valid default profiles found in database.`);
        return;
      }

      const factions = ["bear", "usec"];
      for (const [_, profile] of Object.entries(defaultProfiles)) {
        if (!profile) continue;
        for (const faction of factions) {
          const skills = profile[faction]?.character?.Skills;
          if (skills) {
            this.setBotSound(skills);
          } else {
            console.warn(`[${this.modName}] Invalid skills data for ${faction} in default profile.`);
          }
        }
      }
    } catch (error) {
      console.error(`[${this.modName}] Error updating default profiles: ${error.message}`);
    }
  }
}

module.exports = { mod: new ConfigurableStepsVolume() };
