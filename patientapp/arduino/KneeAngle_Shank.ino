#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <WiFiManager.h>
#include <sys/time.h>
#include <time.h>


#define MPU_ADDR 0x68

// Firebase URL
// change thigh/shank depending on device
String firebaseURL = "https://patientapp-1c5d4-default-rtdb.asia-southeast1.firebasedatabase.app/sensors/shank.json";

// Raw MPU data
int16_t AccX, AccY, AccZ;
int16_t GyroX, GyroY, GyroZ;

// Angle variables
float gyroBias = 0;
float accelAngle = 0;
float gyroAngle = 0;
float fusedAngle = 0;

unsigned long prevTime;
unsigned long lastSend = 0;


void initMPU() {

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1
  Wire.write(0x00); // Wake MPU
  Wire.endTransmission(true);

  Serial.println("MPU Initialized");
}

void calibrateGyro() {

  Serial.println("Calibrating Gyro... Keep sensor still");

  for (int i = 0; i < 2000; i++) {

    Wire.beginTransmission(MPU_ADDR);
    Wire.write(0x43);
    Wire.endTransmission(false);
    Wire.requestFrom(MPU_ADDR, 2, true);

    int16_t rawGyroX = Wire.read() << 8 | Wire.read();

    gyroBias += rawGyroX / 131.0;

    delay(2);
  }

  gyroBias /= 2000;

  Serial.print("Gyro Bias: ");
  Serial.println(gyroBias);
}

void readMPU() {

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  Wire.endTransmission(false);
  Wire.requestFrom(MPU_ADDR, 14, true);

  AccX = Wire.read() << 8 | Wire.read();
  AccY = Wire.read() << 8 | Wire.read();
  AccZ = Wire.read() << 8 | Wire.read();

  Wire.read(); Wire.read(); // skip temperature

  GyroX = Wire.read() << 8 | Wire.read();
  GyroY = Wire.read() << 8 | Wire.read();
  GyroZ = Wire.read() << 8 | Wire.read();
}

void computeAngle() {

  float ax = AccX / 16384.0;
  float ay = AccY / 16384.0;
  float az = AccZ / 16384.0;

  float gx = (GyroX / 131.0) - gyroBias;

  unsigned long currentTime = millis();
  float dt = (currentTime - prevTime) / 1000.0;
  prevTime = currentTime;

  accelAngle = atan2(ay, az) * 180 / PI;

  gyroAngle += gx * dt;

  fusedAngle = 0.98 * (fusedAngle + gx * dt) + 0.02 * accelAngle;

  Serial.print("ACC: ");
  Serial.print(ax); Serial.print(", ");
  Serial.print(ay); Serial.print(", ");
  Serial.print(az); Serial.print(" | ");

  Serial.print("GYRO X: ");
  Serial.print(gx); Serial.print(" | ");

  Serial.print("ANGLE: ");
  Serial.println(fusedAngle);
}

void sendToFirebase() {

  if (WiFi.status() == WL_CONNECTED) {

    HTTPClient http;

    http.begin(firebaseURL);
    http.addHeader("Content-Type", "application/json");

    String json = "{";
    json += "\"angle\":" + String(fusedAngle) + ",";
    json += "\"timestamp\":\"" + getTimestamp() + "\",";
    json += "\"timestampMs\":" + String(getTimestampMillis());
    json += "}";

    int httpResponseCode = http.POST(json);
    // int httpResponseCode = http.PUT(String(fusedAngle));

    Serial.print("HTTP Response: ");
    Serial.println(httpResponseCode);

    http.end();
  }
}

unsigned long long getTimestampMillis() {
    struct timeval tv;

    if (gettimeofday(&tv, nullptr) != 0) {
      return 0;
    }

    return (static_cast<unsigned long long>(tv.tv_sec) * 1000ULL) + (tv.tv_usec / 1000ULL);
  }

String getTimestamp() {
    struct tm timeinfo;

    if (!getLocalTime(&timeinfo)) {
      return "N/A";
    }

    char buffer[30];
    strftime(buffer, sizeof(buffer), "%Y-%m-%d %H:%M:%S", &timeinfo);

    return String(buffer);
  }

void setup() {

  Serial.begin(115200);

  Wire.begin(21, 22);
  Wire.setClock(100000);

  WiFiManager wm;

  bool res = wm.autoConnect("KneeTracker_Shank");

  if (!res) {
    Serial.println("Failed to connect");
  } else {
    Serial.println("Connected!");
  }

  configTime(8 * 3600, 0, "pool.ntp.org"); // GMT+8

  


  initMPU();

  calibrateGyro();

  prevTime = millis();
}

void loop() {

  readMPU();

  computeAngle();

  // send every 200 ms
  if (millis() - lastSend > 200) {

    sendToFirebase();

    lastSend = millis();
  }

  delay(20);
}
