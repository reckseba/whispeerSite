var path = require("path");
var webpack = require("webpack");

process.env.WHISPEER_ENV = process.env.WHISPEER_ENV || "development";

var plugins = [];

if (process.env.WHISPEER_ENV !== "development") {
	plugins.push(new webpack.optimize.UglifyJsPlugin({
		compress: {
			warnings: false
		}
	}));
}

module.exports = {
	context: path.resolve("./assets/js"),
	plugins: plugins,
	module: {
		noParse: [
			/sjcl\.js$/,
		]
	},
	resolve: {
		modules: [
			path.resolve("./assets/js"),
			"node_modules"
		]
	},
	entry: {
		worker: "./worker/worker.js"
	},
	output: {
		path: path.resolve("./assets/js/build/"),
		publicPath: "/assets/js/build/",
		filename: "[name].bundle.js"
	}
};
