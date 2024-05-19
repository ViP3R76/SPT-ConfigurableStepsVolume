import { DependencyContainer } from "tsyringe";
import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
// import { SaveServer } from "@spt-aki/servers/SaveServer";

class ConfigurableStepsVolume implements IPostDBLoadMod {
    mod: string

    constructor() {
        this.mod = "ConfigurableStepsVolume";
    }
    postDBLoad(container: DependencyContainer) {
        const config = require("../config/config.json");
        if (config.Enabled) {
            const value:Number = (5100 / 100) * config.SilenceStepsByPercentage
            // Set value for new profiles
            const databaseServer = container.resolve("DatabaseServer");
            const tables = databaseServer.getTables();
            const profiles = tables.templates.profiles
            for (const [profileName, profile] of Object.entries(profiles)) {
                const factions = ['bear', 'usec']
                for (const faction of factions) {
                    const skills = profile[faction].character.Skills.Common
                    const CharacterSound = skills.find(o => o.Id === 'BotSound');
                    CharacterSound.Progress = value
                }
            }

            // Trying to set value for loaded/already created profiles
            // const profileHelper = container.resolve("ProfileHelper");
            // const saveServer = container.resolve<SaveServer>("SaveServer");
            // // console.log(saveServer)
            // const profiles = saveServer.getProfiles()
            // // console.log(profiles)

            // for (const sessionID in saveServer.getProfiles()) {
            //     console.log('account')
            //     const account = saveServer.getProfile(sessionID);
            //     console.log(account)
            //     // const account = saveServer.getProfile(sessionID).info;
            //     // if (info.username === account.username) {
            //     //     originalReturn = sessionID;
            //     //     break;
            //     // }
            // }
        }
    }
}

module.exports = { mod: new ConfigurableStepsVolume }
