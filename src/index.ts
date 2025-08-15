import "./env";
import { InSim } from "node-insim";
import {
  AICInput,
  AICSteering,
  AICToggleValue,
  AIInputVal,
  ButtonStyle,
  InSimFlags,
  IS_AIC,
  IS_BTN,
  IS_ISI_ReqI,
  IS_TINY,
  PacketType,
  PlayerFlags,
  TinyType,
} from "node-insim/packets";
import { log } from "./log";
import { PIDController } from "@/PIDController";

const TARGET_PLID = 2;
const INFO_INTERVAL_MS = 50;

const carState = {
  speed: 0,
};

let targetSpeedKmh = 0;

const inSim = new InSim();
inSim.connect({
  Host: process.env.HOST ?? "127.0.0.1",
  Port: process.env.PORT ? parseInt(process.env.PORT) : 29999,
  Admin: process.env.ADMIN ?? "",
  Interval: INFO_INTERVAL_MS,
  ReqI: IS_ISI_ReqI.SEND_VERSION,
  IName: "AI",
  Flags: InSimFlags.ISF_LOCAL | InSimFlags.ISF_MCI,
});

inSim.on(PacketType.ISP_VER, (packet) => {
  if (packet.ReqI !== IS_ISI_ReqI.SEND_VERSION) {
    return;
  }

  log(`Connected to LFS ${packet.Product} ${packet.Version}`);

  inSim.send(
    new IS_TINY({
      ReqI: 1,
      SubT: TinyType.TINY_NPL,
    }),
  );

  inSim.send(
    new IS_BTN({
      ReqI: 1,
      ClickID: 0,
      W: 10,
      H: 5,
      T: 50,
      L: 50,
      BStyle: ButtonStyle.ISB_DARK,
      Text: "Speed:",
    }),
  );

  inSim.send(
    new IS_BTN({
      ReqI: 1,
      ClickID: 1,
      W: 5,
      H: 5,
      T: 50,
      L: 60,
      BStyle: ButtonStyle.ISB_DARK,
      Text: "-",
    }),
  );

  inSim.send(
    new IS_BTN({
      ReqI: 1,
      ClickID: 2,
      W: 10,
      H: 5,
      T: 55,
      L: 50,
      BStyle: ButtonStyle.ISB_DARK,
      Text: `Target:`,
    }),
  );

  inSim.send(
    new IS_BTN({
      ReqI: 1,
      ClickID: 3,
      W: 5,
      H: 5,
      T: 55,
      L: 60,
      BStyle: ButtonStyle.ISB_DARK | ButtonStyle.ISB_CLICK,
      Text: `\0Target speed in km/h\0${targetSpeedKmh.toString(10)}`,
      TypeIn: 138,
    }),
  );

  inSim.send(
    new IS_AIC({
      PLID: TARGET_PLID,
      Inputs: [
        new AIInputVal({
          Input: AICInput.CS_REPEAT_AI_INFO,
          Time: INFO_INTERVAL_MS / 10,
        }),
        new AIInputVal({
          Input: AICInput.CS_IGNITION,
          Value: AICToggleValue.SWITCH_ON,
        }),
        new AIInputVal({
          Input: AICInput.CS_SET_HELP_FLAGS,
          Value: PlayerFlags.PIF_AUTOGEARS,
        }),
        new AIInputVal({
          Input: AICInput.CS_MSX,
          Value: AICSteering.CENTRE,
        }),
        // new AIInputVal({
        //   Input: AICInput.CS_CHUP,
        //   Value: 1,
        //   Time: 20,
        // }),
      ],
    }),
  );
});

inSim.on(PacketType.ISP_NPL, (packet) => {
  log(`${packet.PName} - ${packet.PLID}`);
});

inSim.on(PacketType.ISP_BTT, (packet) => {
  if (packet.ClickID === 3) {
    targetSpeedKmh = parseInt(packet.Text, 10);

    inSim.send(
      new IS_BTN({
        ReqI: 1,
        ClickID: 3,
        Text: `\0Target speed in km/h\0${targetSpeedKmh.toString(10)}`,
      }),
    );
  }
});

inSim.on(PacketType.ISP_MCI, (packet) => {
  packet.Info.forEach((info) => {
    if (info.PLID === TARGET_PLID) {
      carState.speed = info.Speed;
      // log(`Current: ${info.Speed}`);

      inSim.send(
        new IS_BTN({
          ReqI: 1,
          ClickID: 1,
          BStyle: ButtonStyle.ISB_DARK,
          Text: `${Math.round((info.Speed / 327.68) * 3.6)}`,
        }),
      );
    }
  });
});

inSim.on(PacketType.ISP_AII, (packet) => {
  const throttlePID = new PIDController({ kp: 0.5, ki: 0.1, kd: 0.1 });

  const maxOutput = 840;
  const output = throttlePID.compute(
    (targetSpeedKmh / 3.6) * 327.68,
    carState.speed,
    INFO_INTERVAL_MS / 1000,
  );
  const normalized = Math.max(-1, Math.min(output / maxOutput, 1));

  let throttle: number;
  let brake: number;

  if (normalized > 0) {
    throttle = Math.round(normalized * 65535);
    brake = 0;
  } else if (normalized < 0) {
    throttle = 0;
    brake = Math.round(Math.abs(normalized) * 65535);
  } else {
    throttle = 0;
    brake = 0;
  }

  inSim.send(
    new IS_AIC({
      PLID: TARGET_PLID,
      Inputs: [
        new AIInputVal({
          Input: AICInput.CS_THROTTLE,
          Value: throttle,
        }),
        new AIInputVal({
          Input: AICInput.CS_BRAKE,
          Value: brake,
        }),
      ],
    }),
  );
});

inSim.on("connect", () => log("InSim connected"));
inSim.on("disconnect", () => log("InSim disconnected"));

process.on("uncaughtException", (error) => {
  log(error);
  inSim.disconnect();
});
