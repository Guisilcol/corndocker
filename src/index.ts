import { $ } from "bun";
import { parseArgs } from "util";

const FOLDER = 'docker_composes'

namespace Args {

    export const parse = () => {
        const parsedArgs =  parseArgs({
            args: Bun.argv,
            allowPositionals: true,
        })

        //Remove the first element of the array IF they are the bun command 
        if (parsedArgs.positionals[0].endsWith("bun")) {
            parsedArgs.positionals.shift()
        }

        return parsedArgs;

    }
}

namespace Dir {

    export const getFolderContent = async (path: string) => {
        const filesAndFolders = await $`ls ${path}`.text()
        return filesAndFolders.split("\n")
    }

    export const folderExists = async (path: string) => {
        const result = await $`[ -d ${path} ] && echo "true" || echo "false"`.text()
        
        return result.trim() === "true"
    }

    export const getRootPath = async (bin: string) => {
        const commandOut = await $`whereis ${bin}`.quiet().text()  

        if (commandOut === "") {
            throw new Error(`Command ${bin} not found in PATH variable. Please make sure it's installed and available in your system.`)
        }

        const firstRow = commandOut.split("\n")[0]
        const splitedPath = firstRow.replace(`${bin}: `, "").split('/')
        splitedPath.pop()
        const path = splitedPath.join("/")
        return path
    }
    
}

namespace Validators {
    export const dockerComposeExists = async () => {
        const exitCode = (await $`docker-compose --version`.quiet()).exitCode
        if (exitCode === 0) {
            return true
        }

        return false
    }
}

namespace Commands {

    export const ls = async (rootFolder: string) => {
        const dockerComposesFullpath = `${rootFolder}/${FOLDER}`
        const result = await $`find ${dockerComposesFullpath} -name 'docker-compose.yml'  -printf "%h\n" | sort -u`.text()
        const filesAndFolders = result.split("\n").filter((f) => f !== "")
        const dockerComposesNames = filesAndFolders.map((f) => f.split("/").pop())

        for (const names of dockerComposesNames) {
            console.log(names)
        }
    }

    export const up = async (dockerComposesPath: string, composeName: string) => {
        //Verify if the compose folder exists 

        const composeFullPath = `${dockerComposesPath}/${composeName}`

        if (!await Dir.folderExists(composeFullPath)) {
            throw new Error(`Compose ${composeName} not found`)
        }
        
        const result = await $`docker-compose -f ${composeFullPath}/docker-compose.yml up -d`
        
        if (result.exitCode !== 0) {
            throw new Error(`Error on running docker-compose up -d: ${result.stderr.toString('utf-8')}`)
        }

        console.log(`${result.stdout.toString('utf-8')}`)
        console.log(`Compose ${composeName} started successfully`)
    }

    export const down = async (dockerComposesPath: string, composeName: string) => {
        //Verify if the compose folder exists 

        const composeFullPath = `${dockerComposesPath}/${composeName}`

        if (!await Dir.folderExists(composeFullPath)) {
            throw new Error(`Compose ${composeName} not found`)
        }
        
        const result = await $`docker-compose -f ${composeFullPath}/docker-compose.yml down`
        
        if (result.exitCode !== 0) {
            throw new Error(`Error on running docker-compose down: ${result.stderr.toString('utf-8')}`)
        }

        console.log(`${result.stdout.toString('utf-8')}`)
        console.log(`Compose ${composeName} stopped successfully`)
    }

    export const status = async (rootFolder: string) => {
        const dockerComposesFullpath = `${rootFolder}/${FOLDER}`
        const result = await $`find ${dockerComposesFullpath} -name 'docker-compose.yml'  -printf "%h\n" | sort -u`.text()
        const filesAndFolders = result.split("\n").filter((f) => f !== "")
        const dockerComposesNames = filesAndFolders.map((f) => f.split("/").pop())

        for (const name of dockerComposesNames) {
            const status = await $`docker-compose -f ${dockerComposesFullpath}/${name}/docker-compose.yml ps`.quiet()

            if (status.exitCode == 0) {
                console.log(`Compose ${name}`)
                console.log(status.stdout.toString('utf-8'))
            }
        } 
    }
}

const main = async () => {
    const args = Args.parse();
    
    if (args.positionals.length < 2) {
        console.log("Please provide a valid command to run. Use 'bun h' to see the available commands")
        return
    }

    const [binPath, command, ...rest] = args.positionals;
    const binName = binPath.split("/").pop()
    const rootFolderPath = await Dir.getRootPath(binName as string)
    const dockerImagesPath = `${rootFolderPath}/${FOLDER}`
    const dockerComposesPath = `${rootFolderPath}/${FOLDER}`

    if (!await Validators.dockerComposeExists()) {
        console.log('docker-compose not found in your system')
        return
    }

    if (!await Dir.folderExists(dockerImagesPath)) {
        console.log(`docker-images folder not found`)
        console.log(`creating docker-images folder in ${dockerImagesPath}`)
        await $`mkdir ${dockerImagesPath}`
        console.log(`docker-images folder created successfully`)
    }

    if (!await Dir.folderExists(dockerComposesPath)) {
        console.log(`docker-composes folder not found`)
        console.log(`creating docker-composes folder in ${dockerImagesPath}`)
        await $`mkdir ${dockerImagesPath}`
        console.log(`docker-composes folder created successfully`)
    }
    
    try {
        if (command === 'h') {
            console.log("Commands available:")
            console.log("ls - List all docker-compose files")
            console.log("s - Show the status of all docker-compose files")
            console.log("u - Start a docker-compose file")
            console.log("d - Stop a docker-compose file")
            console.log('docker-compose repository directory: ', dockerComposesPath)
            return
        }

        if (command === "ls") {
            await Commands.ls(rootFolderPath)
            return
        }

        if (command === "s") {
            await Commands.status(rootFolderPath)
            return
        }

        if (command === "u") {
            const [composeName] = rest
            if (!composeName) {
                console.log("Please provide a compose name")
                return
            }
            await Commands.up(dockerComposesPath, composeName)
            return
        }

        if (command === "d") {
            const [composeNameDown] = rest
            if (!composeNameDown) {
                console.log("Please provide a compose name")
                return
            }
            await Commands.down(dockerComposesPath, composeNameDown)
            return
        }

        
        console.log("Please provide a valid command to run. Use 'bun h' to see the available commands")
        return

    } catch (error) {
        console.log(`${error}`)
        return
    }
}


await main()