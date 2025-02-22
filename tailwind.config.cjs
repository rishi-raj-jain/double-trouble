const defaultTheme = require('tailwindcss/defaultTheme');
const colors = require('tailwindcss/colors');
const { themeVariants } = require("tailwindcss-theme-variants");

module.exports = {
	content: [
                 './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
        ],
	theme: {
		extend: {
			colors: {
                                ...colors,
				primary: colors.blue,
				secondary: colors.pink,
                                slate: {
                                       900: '#0d1117',
                                       800: '#161b22',
                                }

			},
			fontFamily: {
				sans: ["var(--aw-font-sans)", ...defaultTheme.fontFamily.sans],
			},
		},
	},
	plugins: [
                require('@tailwindcss/typography'),
                themeVariants({
                    themes: {
                        light: {
                            selector: ".light",
                        },
                        dark: {
                            selector: ".dark",
                        },
                    },
                }),
        ],
};

/*

  Alternative tailwind.config.js

  NOTE: Add this fonts to <head>
    <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;700&display=swap" rel="stylesheet" />
*/

// module.exports = {
//   content: ["./src/**/*.{astro,html,js,jsx,md,svelte,ts,tsx,vue}"],
//   theme: {
//     extend: {
//       colors: {
//         primary: colors.cyan,
//         secondary: colors.lime,
//       },
//       fontFamily: {
//         sans: ["'Nunito'", ...defaultTheme.fontFamily.sans],
//       },
//     },
//   },
//   plugins: [require("@tailwindcss/typography")],
//   darkMode: "class",
// };
