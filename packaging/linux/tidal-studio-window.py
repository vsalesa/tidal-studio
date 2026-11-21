#!/usr/bin/python3
"""
Tidal Studio window for Linux: shows the studio (already running at the given URL) in a GTK window
with WebKit, so it looks and behaves like a native app. Run with the SYSTEM Python, which has the
GTK bindings (python3-gi, gir1.2-webkit2-4.1). Exits with code 3 if they are missing, so the
launcher can fall back to a browser in app mode.

Usage: tidal-studio-window.py <url> [title]
"""
import os
import sys

try:
    import gi
    gi.require_version("Gtk", "3.0")
    try:
        gi.require_version("WebKit2", "4.1")
    except ValueError:
        gi.require_version("WebKit2", "4.0")
    from gi.repository import Gtk, Gdk, WebKit2, Gio, GLib
except Exception as e:  # noqa: BLE001
    print(f"[window] GTK/WebKit not available: {e}", file=sys.stderr)
    sys.exit(3)

URL = sys.argv[1]
TITLE = sys.argv[2] if len(sys.argv) > 2 else "Tidal Studio"
DATA = os.path.join(os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share"), "tidal-studio", "webview")


def is_studio(uri):
    return uri.startswith(URL.rstrip("/")) or uri.startswith(("about:", "blob:", "data:"))


def open_outside(uri):
    try:
        Gio.AppInfo.launch_default_for_uri(uri, None)
    except GLib.Error as e:
        print(f"[window] could not open {uri}: {e}", file=sys.stderr)


def on_decide(view, decision, kind):
    if kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
        uri = decision.get_navigation_action().get_request().get_uri()
        if not is_studio(uri):
            open_outside(uri)
            decision.ignore()
            return True
    elif kind == WebKit2.PolicyDecisionType.NEW_WINDOW_ACTION:
        uri = decision.get_navigation_action().get_request().get_uri()
        if is_studio(uri):
            view.load_uri(uri)
        else:
            open_outside(uri)
        decision.ignore()
        return True
    elif kind == WebKit2.PolicyDecisionType.RESPONSE:
        if not decision.is_mime_type_supported():
            decision.download()
            return True
    return False


def on_download(ctx, download):
    def decide(dl, suggested):
        dlg = Gtk.FileChooserNative.new("Save", win, Gtk.FileChooserAction.SAVE, None, None)
        dlg.set_current_name(suggested)
        dlg.set_do_overwrite_confirmation(True)
        if dlg.run() == Gtk.ResponseType.ACCEPT:
            dl.set_destination(dlg.get_uri())
        else:
            dl.cancel()
        return True
    download.connect("decide-destination", decide)


def on_key(widget, ev):
    ctrl = ev.state & Gdk.ModifierType.CONTROL_MASK
    if ctrl and ev.keyval in (Gdk.KEY_plus, Gdk.KEY_equal):
        view.set_zoom_level(min(view.get_zoom_level() + 0.1, 3))
    elif ctrl and ev.keyval == Gdk.KEY_minus:
        view.set_zoom_level(max(view.get_zoom_level() - 0.1, 0.5))
    elif ctrl and ev.keyval == Gdk.KEY_0:
        view.set_zoom_level(1)
    elif ev.keyval == Gdk.KEY_F5 or (ctrl and ev.keyval == Gdk.KEY_r):
        view.reload()
    elif ev.keyval == Gdk.KEY_F11:
        if win.get_window().get_state() & Gdk.WindowState.FULLSCREEN:
            win.unfullscreen()
        else:
            win.fullscreen()
    else:
        return False
    return True


os.makedirs(DATA, exist_ok=True)
try:
    manager = WebKit2.WebsiteDataManager(base_data_directory=DATA, base_cache_directory=os.path.join(DATA, "cache"))
    ctx = WebKit2.WebContext.new_with_website_data_manager(manager)
except Exception:  # noqa: BLE001
    ctx = WebKit2.WebContext.get_default()
ctx.connect("download-started", on_download)

view = WebKit2.WebView.new_with_context(ctx)
settings = view.get_settings()
settings.set_enable_developer_extras(True)
settings.set_media_playback_requires_user_gesture(False)
settings.set_javascript_can_open_windows_automatically(True)
view.connect("decide-policy", on_decide)

win = Gtk.Window(title=TITLE)
win.set_wmclass("tidal-studio", "Tidal Studio")
win.set_icon_name("tidal-studio")
scr = win.get_screen()
win.set_default_size(min(1480, int(scr.get_width() * 0.92)), min(940, int(scr.get_height() * 0.9)))
win.add(view)
win.connect("destroy", Gtk.main_quit)
win.connect("key-press-event", on_key)
view.load_uri(URL)
win.show_all()
Gtk.main()
sys.exit(0)
