import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [...nextVitals, { rules: { "@next/next/no-img-element": "off" } }];

export default eslintConfig;
