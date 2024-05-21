import { DependencyContainer } from "tsyringe";
import { IPreAkiLoadMod } from "@spt-aki/models/external/IPreAkiLoadMod";
import { IPostAkiLoadMod } from "@spt-aki/models/external/IPostAkiLoadMod";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Skills } from "@spt-aki/models/eft/common/tables/IBotBase";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { PlayerScavGenerator } from "@spt-aki/generators/PlayerScavGenerator";
import config from "../config.json";

class ConfigurableStepsVolume implements IPreAkiLoadMod, IPostAkiLoadMod, IPostDBLoadMod {
    modName: string = "ConfigurableStepsVolume";
    private container: DependencyContainer;
    private profileHelper: ProfileHelper;
    value: Number = (5100 / 100) * config.SilenceStepsByPercentage

    // Find BotSound skill in the list of skills and change it's value 
    private setBotSound(skills: Skills): void {
        const common = skills.Common
        const BotSoundSkill = common.find(o => o.Id === 'BotSound');
        if (BotSoundSkill) {
            BotSoundSkill.Progress = this.value;
        }
        return skills
    }

    // This sets the skill value on for playerScav by patching getScavSkills function inside GeneratePlayerScav class
    private patchGeneratePlayerScav(): void
    {
        const oldClass = this.container.resolve<PlayerScavGenerator>("PlayerScavGenerator"); // Get the original class

        this.container.afterResolution("PlayerScavGenerator", (_t, result: PlayerScavGenerator) => // Patch the original class after it has been resolved
        {
            result.getScavSkills = (scavProfile: IPmcData): Skills => // Patch the original function
            {
                const skills = oldClass.getScavSkills(scavProfile);    // Call the original function and store the return 
                return this.setBotSound(skills)
            }
        }, {frequency: "Always"});
    }

    preAkiLoad(container: DependencyContainer): void {
        if (!config.Enabled) return;

        this.container = container;

        this.patchGeneratePlayerScav();
    }
    postAkiLoad(container: DependencyContainer) {
        this.profileHelper = container.resolve<ProfileHelper>("ProfileHelper");
        const profiles = this.profileHelper.getProfiles();

        // This sets the skill value on all existing profiles
        Object.keys(profiles).forEach((key) => {
            this.setBotSound(profiles[key].characters.pmc.Skills)
        });
    }
    postDBLoad(container: DependencyContainer) {
        if (!config.Enabled) return;

        // This sets the default skill value when creating a new profile/wiping
        const databaseServer = container.resolve("DatabaseServer");
        const defaultProfiles = databaseServer.getTables().templates.profiles;
        const factions = ['bear', 'usec']
        for (const [_, profile] of Object.entries(defaultProfiles)) {
            for (const faction of factions) {
                const skills = profile[faction].character.Skills
                this.setBotSound(skills)
            }
        }
    }
}

module.exports = { mod: new ConfigurableStepsVolume }
