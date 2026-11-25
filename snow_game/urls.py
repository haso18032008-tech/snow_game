from django.urls import path

from . import views

urlpatterns = [
    path("", views.snow_game_view, name="snow_game"),
    path("ping/", views.ping, name="ping"),
    path("api/save/", views.api_save, name="snow_game_save"),
    path("api/leaderboard/", views.api_board, name="snow_game_board"),
    path("api/leaderboard/<int:pk>/", views.api_player, name="snow_game_player"),
]
