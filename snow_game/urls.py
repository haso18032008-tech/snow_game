from django.urls import path

from . import panel, views

urlpatterns = [
    path("", views.snow_game_view, name="snow_game"),
    path("ping/", views.ping, name="ping"),
    path("api/save/", views.api_save, name="snow_game_save"),
    path("api/leaderboard/", views.api_board, name="snow_game_board"),
    path("api/leaderboard/<int:pk>/", views.api_player, name="snow_game_player"),
    # панель администратора (только суперпользователь, остальным 404)
    path("panel/", panel.dashboard, name="snow_panel"),
    path("panel/players/", panel.players, name="snow_panel_players"),
    path("panel/players/<int:pk>/", panel.player, name="snow_panel_player"),
]
