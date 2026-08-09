const { loadFramework } = require("./frameworkLoader");

class CognitiveKernel {
  constructor() {
    this.framework = loadFramework();

    console.log(
      `🧠 ${this.framework.framework.name} v${this.framework.framework.version} cargado (${this.framework.experiences.length} experiencias)`
    );
  }

  getFramework() {
    return this.framework;
  }

  getExperience(templateCode) {
    return this.framework.experiences.find(
      (experience) => experience.template_code === templateCode,
    );
  }
}

module.exports = new CognitiveKernel();