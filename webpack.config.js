var path = require("path");
var webpack = require("webpack");

process.env.WHISPEER_ENV = process.env.WHISPEER_ENV || "development";

var UnusedFilesWebpackPlugin = require("unused-files-webpack-plugin")["default"];

var unusedFiles = new UnusedFilesWebpackPlugin({
	globOptions: {
		ignore: [
			"node_modules/**/*",
			"**/*.json",
			"**/*.md",
			"**/*.markdown",
			"build/*",
			"crypto/sjclWorker.js",
			"worker/worker.js",
			"helper/helper.d.ts",
			"helper/helper.js"
		]
	}
});

var BundleAnalyzerPlugin = require("webpack-bundle-analyzer").BundleAnalyzerPlugin
var WebpackBundleSizeAnalyzerPlugin = require("webpack-bundle-size-analyzer").WebpackBundleSizeAnalyzerPlugin

var data = require(path.resolve("package.json"))

var plugins = [
	new webpack.optimize.CommonsChunkPlugin({
		names: "commons",
		filename: "commons.bundle.js",

		minChunks: 2,
		chunks: ["login", "register", "main", "recovery", "verifyMail"]
	}),
	new webpack.optimize.MinChunkSizePlugin({
		minChunkSize: 2048
	}),
	new webpack.DefinePlugin({
		"WHISPEER_ENV": JSON.stringify(process.env.WHISPEER_ENV),
		"WHISPEER_BUSINESS": JSON.stringify(!!process.env.WHISPEER_BUSINESS),
		"CLIENT_INFO": JSON.stringify({
			type: "browser",
			version: data.version
		})
	}),
	new webpack.optimize.ModuleConcatenationPlugin(),
	new BundleAnalyzerPlugin({
		analyzerMode: "static",
		reportFilename: "report-chunks.html",
		openAnalyzer: false
	}),
	new WebpackBundleSizeAnalyzerPlugin("./report-size.txt"),
	unusedFiles,
];

var bail = false;
var devtool = "cheap-inline-source-map";

if (process.env.WHISPEER_ENV !== "development") {
	bail = true;
	devtool = "source-map";
}

var config = {
	context: path.resolve("./assets/js"),
	plugins: plugins,
	devtool: devtool,
	bail: bail,
	resolve: {
		modules: [
			path.resolve("./assets/js"),
			"node_modules"
		],
		extensions: [".webpack.js", ".web.js", ".ts", ".tsx", ".js"],
		alias: {
			whispeerHelper: "helper/helper",
			angular: "angular",
			angularUiRouter: "angular-ui-router",
			angularTouch: "angular-touch",
			socket: "socket.io-client",
			imageLib: "blueimp-load-image",
			localizationModule: "i18n/localizationModule",
			workerQueue: "worker/worker-queue",
			PromiseWorker: "worker/worker-loader",
			debug: "debug",
			qtip: "qtip2"
		}
	},
	module: {
		rules: [
			{ test: /angular\.js/, loader: "imports-loader?jquery!exports-loader?angular" },
			{ test: /\.html$/, loader: "ngtemplate-loader?relativeTo=assets/views/!html-loader?-attrs" },
			// all files with a `.ts` or `.tsx` extension will be handled by `ts-loader`
			{ test: /\.tsx?$/, loader: "ts-loader", exclude: /node_modules/ },
			{ test: /\.js$/, loader: "babel-loader", exclude: /(node_modules|bower_components)/ },
		],
		noParse: [
			/sjcl\.js$/,
			/socket\.io\.js$/,
			/visionmedia-debug\/.*debug\.js$/,
		]
	},
	entry: {
		login: "./login/loginMain.js",
		register: "./register/registerMain.js",
		main: "./main.js",
		recovery: "./recovery/recoveryMain.js",
		verifyMail: "./verifyMail/verifyMailMain.js"
	},
	output: {
		path: path.resolve("./assets/js/build/"),
		publicPath: "/assets/js/build/",
		filename: "[name].bundle.js"
	}
};

module.exports = config;
