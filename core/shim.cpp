/* A tiny libretro frontend for the browser: the same answers engine/emulator.py gives the Stella core,
   in C, so JavaScript only has to call af_* functions and read memory. */
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <emscripten.h>
#include <exception>
#include <sys/stat.h>
#include "libretro.h"

#define MAX_OPTIONS 128
#define MAX_AUDIO_FRAMES 8192
#define FRAME_BYTES (1024 * 1024)

static const char* option_keys[MAX_OPTIONS];
static char* option_values[MAX_OPTIONS];
static int option_count = 0;

static enum retro_pixel_format pixel_format = RETRO_PIXEL_FORMAT_0RGB1555;
static unsigned char frame[FRAME_BYTES];
static unsigned frame_width = 0, frame_height = 0;
static size_t frame_pitch = 0;
static int16_t audio[MAX_AUDIO_FRAMES * 2];
static size_t audio_frames = 0;
static unsigned joy_mask = 0;
static unsigned char* rom_copy = NULL;
static uint8_t* ram = NULL;
static size_t ram_size = 0;
static struct retro_system_av_info av_info;

static void core_log(enum retro_log_level level, const char* fmt, ...) {
    if (level < RETRO_LOG_WARN) return;
    va_list args; va_start(args, fmt);
    printf("[core %s] ", level == RETRO_LOG_WARN ? "WARN" : "ERROR");
    vprintf(fmt, args);
    va_end(args);
}

/* "Description; default|other|..." -> "default" (the Python takes the first choice too) */
static char* default_choice(const char* description) {
    const char* start = strstr(description, "; ");
    start = start ? start + 2 : "";
    const char* end = strchr(start, '|');
    size_t length = end ? (size_t)(end - start) : strlen(start);
    char* value = (char*)malloc(length + 1);
    memcpy(value, start, length); value[length] = 0;
    return value;
}

static bool environment(unsigned cmd, void* data) {
    switch (cmd & 0xFFFF) {
    case RETRO_ENVIRONMENT_GET_CAN_DUPE: *(bool*)data = true; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_CORE_ASSETS_DIRECTORY: *(const char**)data = "/stella"; return true;
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE: ((struct retro_log_callback*)data)->log = core_log; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
        pixel_format = *(enum retro_pixel_format*)data;
        return pixel_format == RETRO_PIXEL_FORMAT_XRGB8888 || pixel_format == RETRO_PIXEL_FORMAT_RGB565;
    case RETRO_ENVIRONMENT_SET_VARIABLES: {
        const struct retro_variable* variables = (const struct retro_variable*)data;
        for (option_count = 0; variables[option_count].key && option_count < MAX_OPTIONS; option_count++) {
            option_keys[option_count] = variables[option_count].key;
            option_values[option_count] = default_choice(variables[option_count].value ? variables[option_count].value : "");
        }
        return true;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
        struct retro_variable* variable = (struct retro_variable*)data;
        for (int i = 0; i < option_count; i++)
            if (variable->key && strcmp(option_keys[i], variable->key) == 0) { variable->value = option_values[i]; return true; }
        return false;
    }
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool*)data = false; return true;
    default: return false;  /* everything else: the core's defaults */
    }
}

static void video_refresh(const void* data, unsigned width, unsigned height, size_t pitch) {
    if (!data) return;  /* a duped frame: keep the last one */
    if (height * pitch > FRAME_BYTES) return;
    memcpy(frame, data, height * pitch);
    frame_width = width; frame_height = height; frame_pitch = pitch;
}

static void audio_sample(int16_t left, int16_t right) {
    if (audio_frames >= MAX_AUDIO_FRAMES) return;
    audio[audio_frames * 2] = left; audio[audio_frames * 2 + 1] = right; audio_frames++;
}

static size_t audio_sample_batch(const int16_t* data, size_t frames) {
    size_t room = MAX_AUDIO_FRAMES - audio_frames;
    size_t taken = frames < room ? frames : room;
    memcpy(audio + audio_frames * 2, data, taken * 4);
    audio_frames += taken;
    return frames;
}

static void input_poll(void) {}

static int16_t input_state(unsigned port, unsigned device, unsigned index, unsigned id) {
    if (port == 0 && device == RETRO_DEVICE_JOYPAD && id < 16) return (joy_mask >> id) & 1;
    return 0;
}

extern "C" EMSCRIPTEN_KEEPALIVE void af_init(void) {
    retro_set_environment(environment);
    retro_set_video_refresh(video_refresh);
    retro_set_audio_sample(audio_sample);
    retro_set_audio_sample_batch(audio_sample_batch);
    retro_set_input_poll(input_poll);
    retro_set_input_state(input_state);
    mkdir("/stella", 0777);
    try { retro_init(); } catch (const std::exception& e) { printf("retro_init threw: %s\n", e.what()); }
}

extern "C" EMSCRIPTEN_KEEPALIVE int af_load(const unsigned char* data, size_t size) {
    rom_copy = (unsigned char*)malloc(size); memcpy(rom_copy, data, size);  /* kept: the core may read it after loading */
    struct retro_game_info game = { "adventure.a26", rom_copy, size, NULL };
    try { if (!retro_load_game(&game)) return 0; }
    catch (const std::exception& e) { printf("retro_load_game threw: %s\n", e.what()); return 0; }
    retro_set_controller_port_device(0, RETRO_DEVICE_JOYPAD);
    retro_get_system_av_info(&av_info);
    ram = (uint8_t*)retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM);
    ram_size = retro_get_memory_size(RETRO_MEMORY_SYSTEM_RAM);
    return ram && ram_size >= 128;
}

extern "C" EMSCRIPTEN_KEEPALIVE void af_run(void) { audio_frames = 0; retro_run(); }
extern "C" EMSCRIPTEN_KEEPALIVE void af_set_joy(unsigned mask) { joy_mask = mask; }
extern "C" EMSCRIPTEN_KEEPALIVE uint8_t* af_ram(void) { return ram; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_ram_size(void) { return (int)ram_size; }
extern "C" EMSCRIPTEN_KEEPALIVE unsigned char* af_frame(void) { return frame; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_frame_width(void) { return (int)frame_width; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_frame_height(void) { return (int)frame_height; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_frame_pitch(void) { return (int)frame_pitch; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_pixel_format(void) { return (int)pixel_format; }
extern "C" EMSCRIPTEN_KEEPALIVE int16_t* af_audio(void) { return audio; }
extern "C" EMSCRIPTEN_KEEPALIVE int af_audio_frames(void) { return (int)audio_frames; }
extern "C" EMSCRIPTEN_KEEPALIVE double af_fps(void) { return av_info.timing.fps; }
extern "C" EMSCRIPTEN_KEEPALIVE double af_sample_rate(void) { return av_info.timing.sample_rate; }
