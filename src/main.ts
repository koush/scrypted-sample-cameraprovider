import { BinarySensor, Camera, Device, DeviceCreator, DeviceCreatorSettings, DeviceDiscovery, DeviceProvider, FFmpegInput, Intercom, MediaObject, MediaStreamOptions, MotionSensor, PictureOptions, ResponseMediaStreamOptions, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, ScryptedInterfaceProperty, ScryptedMimeTypes, Setting, Settings, SettingValue, VideoCamera } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
import { StorageSettings } from "@scrypted/sdk/storage-settings"
import fs from 'fs';
import path from 'path';

const { log, deviceManager, mediaManager } = sdk;

// use the dog.jpg from the fs directory that will be packaged with the plugin
const dogImage = fs.readFileSync('dog.jpg');

class SampleCameraDevice extends ScryptedDeviceBase implements Intercom, Camera, VideoCamera, MotionSensor, BinarySensor {
    constructor(public plugin: SampleCameraPlugin, nativeId: string) {
        super(nativeId);
    }

    async takePicture(options?: PictureOptions): Promise<MediaObject> {
        return mediaManager.createMediaObject(dogImage, 'image/jpeg');
    }

    async getPictureOptions(): Promise<PictureOptions[]> {
        // can optionally provide the different resolutions of images that are available.
        // used by homekit, if available.
        return;
    }

    async getVideoStream(options?: MediaStreamOptions): Promise<MediaObject> {
        let ffmpegInput: FFmpegInput;

        const file = path.join(process.env.SCRYPTED_PLUGIN_VOLUME, 'zip', 'unzipped', 'fs', 'dog.mp4');

        ffmpegInput = {
            // the input doesn't HAVE to be an url, but if it is, provide this hint.
            url: undefined,
            inputArguments: [
                '-re',
                '-stream_loop', '-1',
                '-i', file,
            ]
        };

        return mediaManager.createMediaObject(Buffer.from(JSON.stringify(ffmpegInput)), ScryptedMimeTypes.FFmpegInput);
    }

    async getVideoStreamOptions(): Promise<ResponseMediaStreamOptions[]> {
        return [{
            id: 'stream',
            audio: null,
            video: {
                codec: 'h264',
            }
        }];
    }


    async startIntercom(media: MediaObject): Promise<void> {
        const ffmpegInput: FFmpegInput = JSON.parse((await mediaManager.convertMediaObjectToBuffer(media, ScryptedMimeTypes.FFmpegInput)).toString());
        // something wants to start playback on the camera speaker.
        // use their ffmpeg input arguments to spawn ffmpeg to do playback.
        // some implementations read the data from an ffmpeg pipe output and POST to a url (like unifi/amcrest).
        throw new Error('not implemented');
    }

    async stopIntercom(): Promise<void> {
    }

    // most cameras have have motion and doorbell press events, but dont notify when the event ends.
    // so set a timeout ourselves to reset the state.
    triggerBinaryState() {
        this.binaryState = true;
        setTimeout(() => this.binaryState = false, 10000);
    }

    // most cameras have have motion and doorbell press events, but dont notify when the event ends.
    // so set a timeout ourselves to reset the state.
    triggerMotion() {
        this.motionDetected = true;
        setTimeout(() => this.motionDetected = false, 10000);
    }
}

class SampleCameraPlugin extends ScryptedDeviceBase implements DeviceProvider, DeviceDiscovery, Settings, DeviceCreator {
    devices = new Map<string, SampleCameraDevice>();

    settingsStorage = new StorageSettings(this, {
        email: {
            title: 'Email',
            onPut: async () => this.clearTryDiscoverDevices(),
        },
        password: {
            title: 'Password',
            type: 'password',
            onPut: async () => this.clearTryDiscoverDevices(),
        },
        twoFactorCode: {
            title: 'Two Factor Code',
            description: 'Optional: If 2 factor is enabled on your account, enter the code sent to your email or phone number.',
            onPut: async (oldValue, newValue) => {
                await this.tryLogin(newValue);
                await this.discoverDevices(0);
            },
            noStore: true,
        },
    });

    constructor() {
        super();
        this.discoverDevices(0);
    }

    async getCreateDeviceSettings(): Promise<Setting[]> {
        return [
            {
                key: 'name',
                title: 'Name',
            }
        ];
    }

    async createDevice(settings: DeviceCreatorSettings): Promise<string> {
        const nativeId = Math.random().toString();
        await deviceManager.onDeviceDiscovered({
            nativeId,
            type: ScryptedDeviceType.Camera,
            interfaces: [
                ScryptedInterface.VideoCamera,
                ScryptedInterface.Camera,
            ],
            name: settings.name?.toString(),
        });
        return nativeId;
    }

    clearTryDiscoverDevices() {
        // add code to clear any refresh tokens, etc, here. login changed.

        this.discoverDevices(0);
    }

    async tryLogin(twoFactorCode?: string) {
        // this shows a user alert in the ui
        // this.log.a('Login failed! Is your username correct?');
        // throw new Error('login failed');
    }

    getSettings(): Promise<Setting[]> {
        return this.settingsStorage.getSettings();
    }

    putSetting(key: string, value: SettingValue): Promise<void> {
        return this.settingsStorage.putSetting(key, value);
    }

    async discoverDevices(duration: number) {
        await this.tryLogin();
        // add code to retrieve the list of cameras.
        const devices: Device[] = [];
        for (const camera of ['camera 1', 'camera 2']) {
            const nativeId = camera;
            const interfaces = [
                ScryptedInterface.Camera,
                ScryptedInterface.VideoCamera,
                ScryptedInterface.MotionSensor,
            ];
            // if (camera.isDoorbell) {
            //     interfaces.push(
            //         ScryptedInterface.BinarySensor,
            //         ScryptedInterface.Intercom
            //     );
            // }
            const device: Device = {
                info: {
                    model: 'Doggy Cam',
                    manufacturer: 'Sample Camera Manufacturer',
                },
                nativeId,
                name: camera,
                // type: camera.isDoorbell ? ScryptedDeviceType.Doorbell : ScryptedDeviceType.Camera,
                type: ScryptedDeviceType.Camera,
                interfaces,
            };
            devices.push(device);

            // sample code to listen and report doorbell/motion events.
            // varies by api
            // camera.on('doorbell', () => {
            //     const camera = this.devices.get(nativeId);
            //     camera?.triggerBinaryState();
            // });
            // sample code to listen and report doorbell/motion events.
            // varies by api
            // camera.on('motion', () => {
            //     const camera = this.devices.get(nativeId);
            //     camera?.triggerMotion();
            // });
        }

        await deviceManager.onDevicesChanged({
            devices,
        });
        this.console.log('discovered devices');
    }

    getDevice(nativeId: string) {
        if (!this.devices.has(nativeId)) {
            const camera = new SampleCameraDevice(this, nativeId);
            this.devices.set(nativeId, camera);
        }
        return this.devices.get(nativeId);
    }
}

export default new SampleCameraPlugin();
