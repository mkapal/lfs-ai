export class PIDController {
  private kp: number;
  private ki: number;
  private kd: number;
  private previousError: number;
  private integral: number;

  constructor({ kp, ki, kd }: { kp: number; ki: number; kd: number }) {
    this.kp = kp;
    this.ki = ki;
    this.kd = kd;
    this.previousError = 0;
    this.integral = 0;
  }

  compute(setpoint: number, processVariable: number, dt: number) {
    const error = setpoint - processVariable;
    this.integral += error * dt;
    const derivative = (error - this.previousError) / dt;
    this.previousError = error;

    return this.kp * error + this.ki * this.integral + this.kd * derivative;
  }
}
