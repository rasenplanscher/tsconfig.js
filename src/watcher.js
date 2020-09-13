const EventEmitter = require('events')

const chokidar = require('chokidar')

const resolvePath = require('./resolve-path')

const {
	ERROR,
	READY,

	CREATE, CREATE_TARGET, CREATE_DEPENDENCY,
	UPDATE, UPDATE_TARGET, UPDATE_DEPENDENCY,
	DELETE, DELETE_TARGET, DELETE_DEPENDENCY,
} = require('./events')


module.exports = function watch(
	{ log, root = '.', ignore = [], extensions = ['.js'] },
	watchDependencies = false
) {
	log.silly(`Extensions: ${extensions.join(', ')}`)
	if (extensions.length > 1 || extensions[0] !== '.js') {
		log.debug('Extensions list not default. Enabling transpilers.')
		require('./enable-extensions')(extensions)
	}

	if (!Array.isArray(ignore)) {
		ignore = [ignore]
	}

	const external = new EventEmitter()

	const matchFiles = extensions.map(ext => `${resolvePath(root).replace(/\\/g, '/')}/**/tsconfig${ext}`)
	const ignored = [
		'**/.git',
		'**/node_modules',

		...ignore.map(fp => resolvePath(fp))
	]

	log.debug(`Looking for files matching [
		${matchFiles.join('\n\t\t')}
	], while ignoring [
		${ignored.join('\n\t\t')}
	]`.replace(/\t/g, '    '))
	const buildWatcher = chokidar.watch(
		matchFiles,
		{
			ignoreInitial: false,
			ignored,
		}
	)

	buildWatcher.on(READY, () => external.emit(READY))
	buildWatcher.on(ERROR, error => external.emit(ERROR, error))

	buildWatcher.on(CREATE, file => external.emit(CREATE_TARGET, resolvePath(file)))
	buildWatcher.on(UPDATE, file => external.emit(UPDATE_TARGET, resolvePath(file)))
	buildWatcher.on(DELETE, file => external.emit(DELETE_TARGET, resolvePath(file)))

	if (watchDependencies) {
		const dependencyWatcher = chokidar.watch()

		dependencyWatcher.on(ERROR, error => external.emit(ERROR, error))
		dependencyWatcher.on(CREATE, file => external.emit(CREATE_DEPENDENCY, resolvePath(file)))
		dependencyWatcher.on(UPDATE, file => external.emit(UPDATE_DEPENDENCY, resolvePath(file)))
		dependencyWatcher.on(DELETE, file => external.emit(DELETE_DEPENDENCY, resolvePath(file)))

		external.close = () => {
			buildWatcher.close()
			dependencyWatcher.close()
		}

		external.addDependency = filepath => dependencyWatcher.add(filepath)
		external.clearDependency = filepath => dependencyWatcher.unwatch(filepath)
	} else {
		external.close = () => {
			buildWatcher.close()
		}
	}

	return external
}
