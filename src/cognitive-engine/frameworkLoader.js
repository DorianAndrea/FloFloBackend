const fs = require("fs");
const path = require("path");

const frameworkPath = path.join(
  __dirname,
  "framework",
  "floflo_cognitive_framework_v1.json",
);

let framework = null;

const loadFramework = () => {
  if (!framework) {
    framework = JSON.parse(
      fs.readFileSync(frameworkPath, "utf8"),
    );

    console.log(
      `🧠 FloFlo Cognitive Framework v${framework.framework.version} cargado.`,
    );
  }

  return framework;
};

module.exports = {
  loadFramework,
};